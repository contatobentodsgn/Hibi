#include <napi.h>
#import <Cocoa/Cocoa.h>
#import <AVFoundation/AVFoundation.h>

// The window is intentionally small. It expands from the camera housing as a
// compact square surface instead of becoming a wide desktop notification.
// O host nativo só desenha cartões passivos: `ShowHost` recusa apresentações com ações,
// que vão para a overlay Electron. Por isso existe uma altura só.
constexpr CGFloat kBodyWidth = 220.0;
constexpr CGFloat kShoulderWidth = 22.0;
constexpr CGFloat kShoulderDepth = 34.0;
constexpr CGFloat kShoulderTension = 0.58;
constexpr CGFloat kHostWidth = kBodyWidth + (kShoulderWidth * 2.0);
constexpr CGFloat kPassiveHeight = 167.0;

static NSPanel *gPanel = nil;
static NSString *gRequestId = nil;
static NSNumber *gDisplayId = nil;
static id gScreenObserver = nil;
static NSTimer *gFaceTimer = nil;
static CGFloat gScale = 1.0;

// A parte que encontra a barra de menus é suave como no notch de referência;
// a base continua mais generosa para conservar o peso visual do companion fechado.
constexpr CGFloat kBottomCornerRadius = 30.0;

NSString *StringFromValue(const Napi::Value &value) {
  return [NSString stringWithUTF8String:value.As<Napi::String>().Utf8Value().c_str()];
}

@interface HibiNotchPanel : NSPanel
@end
@implementation HibiNotchPanel
// Um cartão passivo nunca recebe foco: sem isto o NSPanel aceitaria virar janela-chave e roubaria
// o teclado do app em primeiro plano.
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@interface HibiNotchContentView : NSView
@property(nonatomic, copy) NSString *message;
@property(nonatomic) CGFloat facePhase;
@property(nonatomic, strong) AVQueuePlayer *animationPlayer;
@property(nonatomic, strong) AVPlayerLooper *animationLooper;
@property(nonatomic, strong) AVPlayerLayer *animationLayer;
@property(nonatomic, strong) CAShapeLayer *shapeMask;
- (void)setPresentationMessage:(NSString *)message;
- (void)applyTopInset:(CGFloat)topInset;
- (void)setAnimationPath:(NSString *)animationPath;
- (BOOL)isAnimatingAsset;
- (void)advanceFace:(NSTimer *)timer;
@end

@implementation HibiNotchContentView
- (instancetype)initWithFrame:(NSRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.wantsLayer = YES;
    self.layer.backgroundColor = NSColor.blackColor.CGColor;
    self.shapeMask = [CAShapeLayer layer];
    self.layer.mask = self.shapeMask;
    self.message = @"Hibi";
    self.facePhase = 0.0;
  }
  return self;
}
- (void)layout {
  [super layout];
  const NSRect bounds = self.bounds;
  const CGFloat bodyLeft = kShoulderWidth * gScale;
  const CGFloat bodyRight = bodyLeft + (kBodyWidth * gScale);
  const CGFloat shoulderDepth = MIN(kShoulderDepth * gScale, bounds.size.height / 3.0);
  const CGFloat bottomRadius = MIN(kBottomCornerRadius * gScale, MIN(kBodyWidth * gScale, bounds.size.height) / 2.0);
  const CGFloat minX = NSMinX(bounds);
  const CGFloat maxX = NSMaxX(bounds);
  const CGFloat minY = NSMinY(bounds);
  const CGFloat maxY = NSMaxY(bounds);
  CGMutablePathRef path = CGPathCreateMutable();
  // O topo ocupa a largura externa máxima. Cada lado usa uma única cúbica
  // monotônica: o primeiro handle é horizontal e o segundo é vertical.
  CGPathMoveToPoint(path, NULL, minX, maxY);
  CGPathAddLineToPoint(path, NULL, maxX, maxY);
  const CGFloat tangentLength = kShoulderWidth * gScale * kShoulderTension;
  const CGFloat verticalHandle = shoulderDepth * (1.0 - kShoulderTension);
  CGPathAddCurveToPoint(path, NULL,
                        maxX - tangentLength, maxY,
                        bodyRight, maxY - shoulderDepth + verticalHandle,
                        bodyRight, maxY - shoulderDepth);
  CGPathAddLineToPoint(path, NULL, bodyRight, minY + bottomRadius);
  CGPathAddArcToPoint(path, NULL, bodyRight, minY, bodyRight - bottomRadius, minY, bottomRadius);
  CGPathAddLineToPoint(path, NULL, bodyLeft + bottomRadius, minY);
  CGPathAddArcToPoint(path, NULL, bodyLeft, minY, bodyLeft, minY + bottomRadius, bottomRadius);
  CGPathAddLineToPoint(path, NULL, bodyLeft, maxY - shoulderDepth);
  CGPathAddCurveToPoint(path, NULL,
                        bodyLeft, maxY - shoulderDepth + verticalHandle,
                        minX + tangentLength, maxY,
                        minX, maxY);
  CGPathCloseSubpath(path);
  self.shapeMask.frame = bounds;
  self.shapeMask.path = path;
  CGPathRelease(path);
  self.animationLayer.frame = bounds;
}
- (void)advanceFace:(NSTimer *)timer {
  if (self.animationLayer) return;
  self.facePhase += 0.12;
  [self setNeedsDisplay:YES];
}
- (void)applyTopInset:(CGFloat)topInset {
  // A geometria já está presa ao topo físico; o formato é igual em telas com e sem câmera.
  [self setNeedsLayout:YES];
}
- (void)setAnimationPath:(NSString *)animationPath {
  [self.animationPlayer pause];
  [self.animationLayer removeFromSuperlayer];
  self.animationPlayer = nil;
  self.animationLooper = nil;
  self.animationLayer = nil;
  if (animationPath.length == 0 || ![[NSFileManager defaultManager] fileExistsAtPath:animationPath]) {
    [self setNeedsDisplay:YES];
    return;
  }
  AVPlayerItem *item = [AVPlayerItem playerItemWithURL:[NSURL fileURLWithPath:animationPath]];
  AVQueuePlayer *player = [AVQueuePlayer queuePlayerWithItems:@[]];
  player.muted = YES;
  player.actionAtItemEnd = AVPlayerActionAtItemEndNone;
  self.animationLooper = [AVPlayerLooper playerLooperWithPlayer:player templateItem:item];
  self.animationPlayer = player;
  self.animationLayer = [AVPlayerLayer playerLayerWithPlayer:player];
  self.animationLayer.videoGravity = AVLayerVideoGravityResizeAspect;
  self.animationLayer.frame = self.bounds;
  [self.layer insertSublayer:self.animationLayer atIndex:0];
  [player play];
  [self setNeedsDisplay:YES];
}
- (BOOL)isAnimatingAsset { return self.animationLayer != nil; }
- (void)setPresentationMessage:(NSString *)message {
  self.message = message.length > 0 ? message : @"Hibi";
  [self setNeedsDisplay:YES];
}
- (BOOL)isAccessibilityElement { return YES; }
- (NSAccessibilityRole)accessibilityRole { return NSAccessibilityGroupRole; }
- (NSString *)accessibilityLabel { return self.message; }
- (void)drawRect:(NSRect)dirtyRect {
  [super drawRect:dirtyRect];
  if (self.animationLayer) return;
  const NSRect bounds = self.bounds;
  const BOOL blinking = fmod(self.facePhase, 5.4) < 0.18;
  const CGFloat eyeHeight = blinking ? 6.0 : 43.0;
  const CGFloat eyeY = blinking ? 97.0 : 78.0;
  [[NSColor whiteColor] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(49.0, eyeY, 27.0, eyeHeight) xRadius:14.0 yRadius:14.0] fill];
  [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(bounds.size.width - 76.0, eyeY, 27.0, eyeHeight) xRadius:14.0 yRadius:14.0] fill];
  NSBezierPath *smile = [NSBezierPath bezierPath];
  [smile moveToPoint:NSMakePoint(87.0, 58.0)];
  [smile curveToPoint:NSMakePoint(133.0, 58.0) controlPoint1:NSMakePoint(99.0, 48.0) controlPoint2:NSMakePoint(121.0, 48.0)];
  smile.lineWidth = 3.0;
  [[NSColor whiteColor] setStroke];
  [smile stroke];
}
@end

NSScreen *ScreenForDisplayId(uint64_t displayId) {
  for (NSScreen *screen in NSScreen.screens) {
    NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
    if (screenNumber && screenNumber.unsignedLongLongValue == displayId) return screen;
  }
  for (NSScreen *screen in NSScreen.screens) if (screen.safeAreaInsets.top > 0.0) return screen;
  return NSScreen.screens.firstObject;
}

HibiNotchContentView *HostContentView() {
  return [gPanel.contentView isKindOfClass:HibiNotchContentView.class] ? (HibiNotchContentView *)gPanel.contentView : nil;
}

BOOL PositionHost(uint64_t displayId);

BOOL EnsureHost() {
  if (gPanel) return YES;
  NSRect frame = NSMakeRect(0, 0, kHostWidth * gScale, kPassiveHeight * gScale);
  HibiNotchPanel *panel = [[HibiNotchPanel alloc] initWithContentRect:frame styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
  panel.opaque = NO;
  panel.backgroundColor = NSColor.clearColor;
  panel.hasShadow = NO;
  panel.movable = NO;
  panel.releasedWhenClosed = NO;
  panel.hidesOnDeactivate = NO;
  panel.level = NSScreenSaverWindowLevel + 1;
  panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorTransient | NSWindowCollectionBehaviorIgnoresCycle;
  panel.contentView = [[HibiNotchContentView alloc] initWithFrame:frame];
  gPanel = panel;
  gScreenObserver = [[NSNotificationCenter defaultCenter] addObserverForName:NSApplicationDidChangeScreenParametersNotification object:NSApp queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
    if (gPanel && gDisplayId) PositionHost(gDisplayId.unsignedLongLongValue);
  }];
  return YES;
}

BOOL PositionHost(uint64_t displayId) {
  if (!gPanel) return NO;
  NSScreen *screen = ScreenForDisplayId(displayId);
  if (!screen) return NO;
  // O personagem deve cobrir a região física da câmera e tocar o topo da tela.
  CGFloat inset = screen.safeAreaInsets.top;
  CGFloat height = kPassiveHeight * gScale;
  CGFloat width = kHostWidth * gScale;
  NSRect frame = NSMakeRect(NSMidX(screen.frame) - width / 2.0, NSMaxY(screen.frame) - height, width, height);
  [gPanel setLevel:NSScreenSaverWindowLevel + 1];
  [gPanel setFrame:frame display:YES animate:NO];
  HibiNotchContentView *view = HostContentView();
  [view applyTopInset:inset];
  [view setNeedsDisplay:YES];
  gDisplayId = @(displayId);
  return YES;
}

Napi::Value Available(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value PromotionAvailable(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value ScreenGeometry(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); Napi::Array output = Napi::Array::New(env); NSUInteger index = 0;
  for (NSScreen *screen in NSScreen.screens) {
    NSRect frame = screen.frame; NSEdgeInsets insets = screen.safeAreaInsets;
    NSRect left = screen.auxiliaryTopLeftArea; NSRect right = screen.auxiliaryTopRightArea;
    Napi::Object item = Napi::Object::New(env); item.Set("index", Napi::Number::New(env, index++)); item.Set("displayId", Napi::Number::New(env, [screen.deviceDescription[@"NSScreenNumber"] unsignedLongLongValue]));
    Napi::Object frameObject = Napi::Object::New(env); frameObject.Set("x", Napi::Number::New(env, frame.origin.x)); frameObject.Set("y", Napi::Number::New(env, frame.origin.y)); frameObject.Set("width", Napi::Number::New(env, frame.size.width)); frameObject.Set("height", Napi::Number::New(env, frame.size.height)); item.Set("frame", frameObject);
    item.Set("safeAreaTop", Napi::Number::New(env, insets.top)); item.Set("hasCameraHousing", Napi::Boolean::New(env, !NSEqualRects(left, NSZeroRect) || !NSEqualRects(right, NSZeroRect))); output.Set(index - 1, item);
  }
  return output;
}
Napi::Value Place(const Napi::CallbackInfo& info) {
  if (info.Length() < 5 || !info[0].IsBuffer() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()) { Napi::TypeError::New(info.Env(), "Expected native handle and x, y, width, height.").ThrowAsJavaScriptException(); return info.Env().Null(); }
  auto handle = info[0].As<Napi::Buffer<uint8_t>>(); if (handle.Length() < sizeof(void*)) return Napi::Boolean::New(info.Env(), false);
  id __unsafe_unretained nativeObject = *reinterpret_cast<id __unsafe_unretained *>(handle.Data()); if (!nativeObject) return Napi::Boolean::New(info.Env(), false);
  NSWindow *window = nil; if ([nativeObject isKindOfClass:NSView.class]) window = [(NSView *)nativeObject window]; else if ([nativeObject isKindOfClass:NSWindow.class]) window = (NSWindow *)nativeObject; if (!window) return Napi::Boolean::New(info.Env(), false);
  CGFloat x = info[1].As<Napi::Number>().DoubleValue(); CGFloat width = info[3].As<Napi::Number>().DoubleValue(); CGFloat height = info[4].As<Napi::Number>().DoubleValue(); if (width <= 0 || height <= 0) return Napi::Boolean::New(info.Env(), false);
  // Electron usa coordenadas globais com origem no topo; Cocoa usa origem embaixo.
  // Resolva o monitor pelo centro horizontal para não converter uma janela do MacBook
  // usando o frame de um monitor externo que esteja listado primeiro.
  NSScreen *targetScreen = nil; CGFloat centerX = x + width / 2.0;
  for (NSScreen *candidate in NSScreen.screens) if (centerX >= NSMinX(candidate.frame) && centerX <= NSMaxX(candidate.frame)) { targetScreen = candidate; break; }
  if (!targetScreen) targetScreen = NSScreen.screens.firstObject; if (!targetScreen) return Napi::Boolean::New(info.Env(), false);
  // O notch é ancorado no topo físico do monitor. O y global do Electron usa
  // outra origem; convertê-lo diretamente desloca o painel para fora da tela.
  // O x já selecionou o monitor correto, então basta usar o topo do NSScreen.
  // Painéis Electron respeitam a área segura da barra de menus mesmo quando
  // o frame nativo está no topo; este deslocamento neutraliza apenas essa
  // margem (o tamanho do painel permanece inalterado).
  constexpr CGFloat kMenuBarInset = 30.0;
  CGFloat cocoaY = NSMaxY(targetScreen.frame) - height + kMenuBarInset;
  // O nível vem antes do frame: em nível comum o AppKit limita o painel à área
  // visível e o mantém logo abaixo da barra de menus.
  [window setLevel:NSScreenSaverWindowLevel + 1];
  [window setCollectionBehavior:NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorStationary];
  [window setFrame:NSMakeRect(x, cocoaY, width, height) display:YES animate:NO];
  [window setOpaque:NO]; [window setHasShadow:NO]; [window orderFrontRegardless];
  return Napi::Boolean::New(info.Env(), true);
}
Napi::Value NativeHostAvailable(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value CreateHost(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) { Napi::TypeError::New(info.Env(), "Expected an action callback.").ThrowAsJavaScriptException(); return info.Env().Null(); }
  // A função continua obrigatória — é o contrato com `adapters/public.cjs` e com `notch-window.cjs` —,
  // mas o host nativo não a guarda: sem apresentações com ações, nada aqui teria o que despachar.
  return Napi::Boolean::New(info.Env(), EnsureHost());
}
Napi::Value ShowHost(const Napi::CallbackInfo& info) {
  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsNumber() || !EnsureHost()) return Napi::Boolean::New(info.Env(), false);
  Napi::Object presentation = info[0].As<Napi::Object>(); if (!presentation.Has("requestId") || !presentation.Get("requestId").IsString() || !presentation.Has("actions") || !presentation.Get("actions").IsArray()) return Napi::Boolean::New(info.Env(), false);
  gScale = presentation.Has("size") && presentation.Get("size").IsString() && presentation.Get("size").As<Napi::String>().Utf8Value() == "compact" ? 0.85 : 1.0;
  NSString *requestId = StringFromValue(presentation.Get("requestId")); Napi::Array actionsValue = presentation.Get("actions").As<Napi::Array>(); if (requestId.length == 0 || requestId.length > 128) return Napi::Boolean::New(info.Env(), false);
  // O contrato do host nativo: só cartão passivo. Uma apresentação com ações precisa de clique e
  // teclado, que este painel não aceita, e vai para a overlay Electron — `notch-window.cjs` já a
  // encaminha para lá; esta recusa é a segunda tranca, do lado de cá da ponte.
  if (actionsValue.Length() > 0) return Napi::Boolean::New(info.Env(), false);
  NSString *message = presentation.Has("text") && presentation.Get("text").IsString() ? StringFromValue(presentation.Get("text")) : @"Hibi";
  NSString *animationPath = presentation.Has("animationPath") && presentation.Get("animationPath").IsString() ? StringFromValue(presentation.Get("animationPath")) : nil;
  gRequestId = requestId;
  HibiNotchContentView *view = HostContentView();
  [view setPresentationMessage:message];
  [view setAnimationPath:animationPath];
  uint64_t displayId = static_cast<uint64_t>(info[1].As<Napi::Number>().Int64Value());
  if (!PositionHost(displayId)) return Napi::Boolean::New(info.Env(), false);
  gPanel.ignoresMouseEvents = YES;
  gPanel.styleMask |= NSWindowStyleMaskNonactivatingPanel;
  gPanel.becomesKeyOnlyIfNeeded = YES;
  if (!gFaceTimer) gFaceTimer = [NSTimer scheduledTimerWithTimeInterval:1.0 / 24.0 target:view selector:@selector(advanceFace:) userInfo:nil repeats:YES];
  [gPanel orderFrontRegardless];
  return Napi::Boolean::New(info.Env(), true);
}
Napi::Value HideHost(const Napi::CallbackInfo& info) { if (!gPanel) return Napi::Boolean::New(info.Env(), false); [gFaceTimer invalidate]; gFaceTimer = nil; gPanel.ignoresMouseEvents = YES; [gPanel orderOut:nil]; gRequestId = nil; return Napi::Boolean::New(info.Env(), true); }
Napi::Value RepositionHost(const Napi::CallbackInfo& info) {
  if (!gPanel || info.Length() < 1 || !info[0].IsNumber()) return Napi::Boolean::New(info.Env(), false);
  if (info.Length() > 1 && info[1].IsString()) gScale = info[1].As<Napi::String>().Utf8Value() == "compact" ? 0.85 : 1.0;
  return Napi::Boolean::New(info.Env(), PositionHost(static_cast<uint64_t>(info[0].As<Napi::Number>().Int64Value())));
}
Napi::Value DestroyHost(const Napi::CallbackInfo& info) { [gFaceTimer invalidate]; gFaceTimer = nil; if (gPanel) { [gPanel orderOut:nil]; [gPanel close]; gPanel = nil; } if (gScreenObserver) { [[NSNotificationCenter defaultCenter] removeObserver:gScreenObserver]; gScreenObserver = nil; } gRequestId = nil; gDisplayId = nil; return Napi::Boolean::New(info.Env(), true); }
Napi::Value HostDiagnostics(const Napi::CallbackInfo& info) { Napi::Object result = Napi::Object::New(info.Env()); result.Set("available", Napi::Boolean::New(info.Env(), true)); result.Set("created", Napi::Boolean::New(info.Env(), gPanel != nil)); result.Set("visible", Napi::Boolean::New(info.Env(), gPanel != nil && gPanel.isVisible)); if (gDisplayId) result.Set("displayId", Napi::Number::New(info.Env(), gDisplayId.unsignedLongLongValue)); if (gRequestId) result.Set("requestId", Napi::String::New(info.Env(), gRequestId.UTF8String)); HibiNotchContentView *view = HostContentView(); result.Set("animatingAsset", Napi::Boolean::New(info.Env(), [view isAnimatingAsset])); if (gPanel) { NSRect frame = gPanel.frame; Napi::Object rect = Napi::Object::New(info.Env()); rect.Set("x", Napi::Number::New(info.Env(), frame.origin.x)); rect.Set("y", Napi::Number::New(info.Env(), frame.origin.y)); rect.Set("width", Napi::Number::New(info.Env(), frame.size.width)); rect.Set("height", Napi::Number::New(info.Env(), frame.size.height)); result.Set("frame", rect); result.Set("occluded", Napi::Boolean::New(info.Env(), (gPanel.occlusionState & NSWindowOcclusionStateVisible) == 0)); result.Set("activeSpace", Napi::Boolean::New(info.Env(), gPanel.onActiveSpace)); } return result; }
Napi::Value Teardown(const Napi::CallbackInfo& info) { DestroyHost(info); return info.Env().Undefined(); }

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("available", Napi::Function::New(env, Available)); exports.Set("promotionAvailable", Napi::Function::New(env, PromotionAvailable)); exports.Set("screenGeometry", Napi::Function::New(env, ScreenGeometry)); exports.Set("place", Napi::Function::New(env, Place)); exports.Set("teardown", Napi::Function::New(env, Teardown));
  exports.Set("nativeHostAvailable", Napi::Function::New(env, NativeHostAvailable)); exports.Set("createHost", Napi::Function::New(env, CreateHost)); exports.Set("showHost", Napi::Function::New(env, ShowHost)); exports.Set("hideHost", Napi::Function::New(env, HideHost)); exports.Set("repositionHost", Napi::Function::New(env, RepositionHost)); exports.Set("destroyHost", Napi::Function::New(env, DestroyHost)); exports.Set("hostDiagnostics", Napi::Function::New(env, HostDiagnostics)); return exports;
}
NODE_API_MODULE(hibi_notch, Init)
