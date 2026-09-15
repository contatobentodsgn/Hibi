import AVFoundation
import Foundation
import Speech

@main
struct HibiVoice {
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
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else { emit(["type": "error", "message": "Speech locale unavailable"]); return }
        guard await authorization() == .authorized else { emit(["type": "error", "message": "Speech recognition permission denied"]); return }
        let microphoneAllowed = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard microphoneAllowed else { emit(["type": "error", "message": "Microphone permission denied"]); return }
        let audio = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
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
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
        do { audio.prepare(); try audio.start(); emit(["type": "ready"]) } catch { emit(["type": "error", "message": error.localizedDescription]); task.cancel(); return }
        while audio.isRunning { try? await Task.sleep(for: .milliseconds(100)) }
        task.cancel()
    }
}
