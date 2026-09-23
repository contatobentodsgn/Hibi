import AVFoundation
import Foundation
import Speech

/// Diz quando há voz no microfone, pelo nível do áudio, e avisa só nas mudanças. O piso de ruído se ajusta
/// ao ambiente (sobe devagar, desce na hora); é voz o que passa de três vezes o piso por pelo menos 60 ms,
/// e o silêncio só conta depois de 300 ms, para as pausas entre palavras não virarem fim de fala. A ideia
/// de início e fim com margem vem do Handy (MIT); o código é do Hibi.
final class VoiceActivity: @unchecked Sendable {
    private var floor: Float = 0
    private var voicedFor: Double = 0
    private var quietFor: Double = 0
    private var active = false

    func push(_ buffer: AVAudioPCMBuffer) {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for index in 0..<count { sum += samples[index] * samples[index] }
        let level = (sum / Float(count)).squareRoot()
        let seconds = Double(count) / buffer.format.sampleRate
        floor = floor == 0 ? level : (level < floor ? level : floor + (level - floor) * 0.01)
        let voiced = level > max(0.003, floor * 3)
        if voiced { voicedFor += seconds; quietFor = 0 } else { quietFor += seconds; voicedFor = 0 }
        if !active && voicedFor >= 0.06 { active = true; PixanoVoice.emit(["type": "voice", "active": true]) }
        else if active && quietFor >= 0.3 { active = false; PixanoVoice.emit(["type": "voice", "active": false]) }
    }
}

@main
struct PixanoVoice {
    static func emit(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
    }

    static func authorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
    }

    static func main() async {
        let args = CommandLine.arguments
        guard args.dropFirst().first == "listen" else { emit(["type": "error", "message": "listen command required"]); return }
        let locale = args.dropFirst(2).first ?? "pt-BR"
        // Os nomes que o Hibi pede para favorecer ("Kabrito", "Cristiane") chegam pela entrada, em JSON,
        // e não pela linha de comando, onde qualquer processo os veria. Sem a opção, nada é lido.
        var vocabulary: [String] = []
        if args.contains("--vocabulary-stdin") {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            vocabulary = ((try? JSONSerialization.jsonObject(with: data)) as? [String] ?? []).prefix(100).map { $0 }
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else { emit(["type": "error", "message": "Speech locale unavailable"]); return }
        // O Hibi promete que o que se fala fica neste Mac. Sem reconhecimento no dispositivo, a Apple
        // pode processar o áudio nos servidores dela: então aqui se recusa, em vez de mandar o áudio
        // para fora em silêncio.
        guard recognizer.supportsOnDeviceRecognition else {
            emit(["type": "error", "message": "On-device speech recognition is unavailable for this language"])
            return
        }
        guard await authorization() == .authorized else { emit(["type": "error", "message": "Speech recognition permission denied"]); return }
        let microphoneAllowed = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard microphoneAllowed else { emit(["type": "error", "message": "Microphone permission denied"]); return }
        // O reconhecedor do macOS 26 (SpeechAnalyzer) só entra com `PIXANO_VOICE_ENGINE=analyzer`. Medido em
        // 18/09/2026: com áudio limpo, ele acertou mais (85% das palavras-chave contra 61%, já com os nomes
        // corrigidos pelo app); pelo microfone, com o som da sala, cortou e trocou frases que o de sempre
        // acertou. Fica aqui para repetir a medida com a voz de quem usa.
        let environment = ProcessInfo.processInfo.environment
        let wantsAnalyzer = environment["PIXANO_VOICE_ENGINE"] == "analyzer"
        // Só para medir os reconhecedores: com `PIXANO_VOICE_INPUT_FILE`, o áudio vem desse arquivo em vez do
        // microfone, e as mesmas frases gravadas servem de régua para os dois.
        let file = environment["PIXANO_VOICE_INPUT_FILE"].map { URL(fileURLWithPath: $0) }
        if wantsAnalyzer, #available(macOS 26.0, *), await listenWithAnalyzer(locale: Locale(identifier: locale), vocabulary: vocabulary, file: file) { return }
        if let file { await transcribeWithClassic(recognizer: recognizer, vocabulary: vocabulary, file: file); return }
        listenWithClassic(recognizer: recognizer, vocabulary: vocabulary)
        while classicRunning { try? await Task.sleep(for: .milliseconds(100)) }
    }

    nonisolated(unsafe) static var classicRunning = false

    static func listenWithClassic(recognizer: SFSpeechRecognizer, vocabulary: [String]) {
        let audio = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.contextualStrings = vocabulary
        let input = audio.inputNode
        let task = recognizer.recognitionTask(with: request) { result, error in
            if let result { emit(["type": "text", "final": result.isFinal, "text": result.bestTranscription.formattedString]) }
            if error != nil || result?.isFinal == true { audio.stop(); input.removeTap(onBus: 0); request.endAudio() }
        }
        let format = input.inputFormat(forBus: 0)
        guard format.channelCount > 0 else {
            emit(["type": "error", "message": "Nenhuma entrada de microfone está disponível"])
            task.cancel()
            return
        }
        let activity = VoiceActivity()
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in activity.push(buffer); request.append(buffer) }
        do { audio.prepare(); try audio.start(); emit(["type": "ready", "engine": "classic"]) } catch { emit(["type": "error", "message": error.localizedDescription]); task.cancel(); return }
        classicRunning = true
        Task {
            while audio.isRunning { try? await Task.sleep(for: .milliseconds(100)) }
            task.cancel()
            classicRunning = false
        }
    }

    /// O arquivo entra como entraria o microfone — em pedaços e no ritmo da fala —, para a medida valer
    /// para o uso de verdade.
    static func transcribeWithClassic(recognizer: SFSpeechRecognizer, vocabulary: [String], file: URL) async {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.contextualStrings = vocabulary
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            var done = false
            recognizer.recognitionTask(with: request) { result, error in
                if done { return }
                if let result { emit(["type": "text", "final": result.isFinal, "text": result.bestTranscription.formattedString]) }
                if let error { emit(["type": "error", "message": error.localizedDescription]) }
                if error != nil || result?.isFinal == true { done = true; continuation.resume() }
            }
            do {
                let audioFile = try AVAudioFile(forReading: file)
                while audioFile.framePosition < audioFile.length {
                    guard let buffer = AVAudioPCMBuffer(pcmFormat: audioFile.processingFormat, frameCapacity: 4096) else { break }
                    try audioFile.read(into: buffer)
                    request.append(buffer)
                    // No ritmo da fala, como chega do microfone: entregue de uma vez, o reconhecedor perdia frases.
                    Thread.sleep(forTimeInterval: Double(buffer.frameLength) / audioFile.processingFormat.sampleRate)
                }
            } catch { emit(["type": "error", "message": error.localizedDescription]) }
            request.endAudio()
        }
    }

    /// Devolve `false` quando este reconhecedor não serve aqui, para quem chamou usar o de antes; nesse
    /// caso nada foi emitido nem o microfone foi aberto.
    @available(macOS 26.0, *)
    static func listenWithAnalyzer(locale: Locale, vocabulary: [String], file: URL? = nil) async -> Bool {
        guard SpeechTranscriber.isAvailable, let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { return false }
        // `fastResults` faz o texto sair enquanto a pessoa fala. Sem ele, o texto só vinha ao fim de cada
        // trecho: a escuta pelo microfone ficava muda e terminava em "não ouvi nada".
        let transcriber = SpeechTranscriber(locale: supported, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
        // O modelo é reservado por app: o que outro processo baixou não vale para o Hibi, e a lista
        // `installedLocales` o mostra como instalado mesmo assim — a escuta ficava muda, sem texto e sem
        // erro. Sem o modelo, esta escuta usa o reconhecedor de sempre e o download do modelo da Apple
        // começa; a próxima já usa este. Pedir este reconhecedor é pedir também esse download.
        guard await AssetInventory.status(forModules: [transcriber]) == .installed else {
            if let request = try? await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                Task.detached { try? await request.downloadAndInstall() }
            }
            return false
        }
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else { return false }
        let context = AnalysisContext()
        context.contextualStrings[.general] = vocabulary
        // O texto sai inteiro a cada atualização, como no reconhecedor de antes: o que já foi fechado mais o
        // trecho que ainda pode mudar. Quem está do outro lado só olha o texto mais recente.
        let collect = Task {
            var finalized = ""
            do {
                for try await result in transcriber.results {
                    let piece = String(result.text.characters)
                    let text = (finalized + " " + piece).split(whereSeparator: \.isWhitespace).joined(separator: " ")
                    if result.isFinal { finalized += " " + piece }
                    if !text.isEmpty { emit(["type": "text", "final": false, "text": text]) }
                }
            } catch { emit(["type": "error", "message": error.localizedDescription]) }
        }
        if let file {
            do {
                if !vocabulary.isEmpty { try await analyzer.setContext(context) }
                let audioFile = try AVAudioFile(forReading: file)
                emit(["type": "ready", "engine": "analyzer"])
                if let last = try await analyzer.analyzeSequence(from: audioFile) { try await analyzer.finalizeAndFinish(through: last) } else { await analyzer.cancelAndFinishNow() }
            } catch { emit(["type": "error", "message": error.localizedDescription]); collect.cancel(); return true }
            await collect.value
            return true
        }

        let audio = AVAudioEngine()
        let input = audio.inputNode
        let inputFormat = input.inputFormat(forBus: 0)
        guard inputFormat.channelCount > 0 else {
            emit(["type": "error", "message": "Nenhuma entrada de microfone está disponível"])
            return true
        }
        guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else { return false }
        let (inputs, feed) = AsyncStream<AnalyzerInput>.makeStream()
        let activity = VoiceActivity()
        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
            activity.push(buffer)
            let ratio = analyzerFormat.sampleRate / inputFormat.sampleRate
            let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
            guard let converted = AVAudioPCMBuffer(pcmFormat: analyzerFormat, frameCapacity: capacity) else { return }
            var consumed = false
            var failure: NSError?
            converter.convert(to: converted, error: &failure) { _, status in
                if consumed { status.pointee = .noDataNow; return nil }
                consumed = true
                status.pointee = .haveData
                return buffer
            }
            if failure == nil, converted.frameLength > 0 { feed.yield(AnalyzerInput(buffer: converted)) }
        }

        // O microfone abre antes do modelo: carregar o modelo leva um instante, e nesse meio-tempo o áudio
        // espera na fila em vez de se perder. Na ordem inversa, o começo da frase sumia.
        do {
            audio.prepare()
            try audio.start()
            emit(["type": "ready", "engine": "analyzer"])
            if !vocabulary.isEmpty { try await analyzer.setContext(context) }
            try await analyzer.prepareToAnalyze(in: analyzerFormat)
            try await analyzer.start(inputSequence: inputs)
        } catch {
            audio.stop()
            emit(["type": "error", "message": error.localizedDescription])
            input.removeTap(onBus: 0)
            feed.finish()
            collect.cancel()
            return true
        }
        // Quem encerra a escuta é o app, por SIGTERM; se o microfone sumir antes, fecha-se o que foi ouvido.
        while audio.isRunning { try? await Task.sleep(for: .milliseconds(100)) }
        input.removeTap(onBus: 0)
        feed.finish()
        try? await analyzer.finalizeAndFinishThroughEndOfInput()
        await collect.value
        return true
    }
}
