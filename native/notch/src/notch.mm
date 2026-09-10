#include <napi.h>
#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// The window is intentionally small. It expands from the camera housing as a
// compact square surface instead of becoming a wide desktop notification.
constexpr CGFloat kHostWidth = 256.0;
constexpr CGFloat kPassiveHeight = 38.0;
constexpr CGFloat kInteractiveHeight = 190.0;

static napi_env gRawEnv = nullptr;
static Napi::FunctionReference gActionCallback;
static NSPanel *gPanel = nil;
static NSString *gRequestId = nil;
static NSNumber *gDisplayId = nil;
static BOOL gInteractive = NO;
static id gScreenObserver = nil;
static id gKeyObserver = nil;

NSString *StringFromValue(const Napi::Value &value) {
  return [NSString stringWithUTF8String:value.As<Napi::String>().Utf8Value().c_str()];
}

void DispatchAction(NSString *requestId, NSString *actionId) {
  if (!gRawEnv || gActionCallback.IsEmpty() || requestId.length == 0 || actionId.length == 0) return;
  Napi::Env env(gRawEnv);
  Napi::HandleScope scope(env);
  Napi::Object payload = Napi::Object::New(env);
  payload.Set("requestId", Napi::String::New(env, requestId.UTF8String));
  payload.Set("actionId", Napi::String::New(env, actionId.UTF8String));
  gActionCallback.Call({ payload });
}

@interface HibiNotchPanel : NSPanel
@end
@implementation HibiNotchPanel
- (BOOL)canBecomeKeyWindow { return gInteractive; }
- (BOOL)canBecomeMainWindow { return NO; }
- (void)keyDown:(NSEvent *)event {
  if (gInteractive && event.keyCode == 48) {
    NSArray<NSView *> *actions = gPanel.contentView.subviews;
    NSUInteger current = 0;
    NSResponder *firstResponder = self.firstResponder;
    for (NSUInteger index = 0; index < actions.count; index++) if (actions[index] == firstResponder) { current = index; break; }
    BOOL reverse = (event.modifierFlags & NSEventModifierFlagShift) != 0;
    NSUInteger next = reverse ? (current + actions.count - 1) % actions.count : (current + 1) % actions.count;
    [self makeFirstResponder:actions[next]];
    return;
  }
  [super keyDown:event];
}
@end

@interface HibiNotchActionTarget : NSObject
@property(nonatomic, copy) NSString *requestId;
@property(nonatomic, copy) NSString *actionId;
@end
@implementation HibiNotchActionTarget
- (void)activate:(id)sender { DispatchAction(self.requestId, self.actionId); }
@end

@interface HibiNotchContentView : NSView
@property(nonatomic, copy) NSString *message;
@property(nonatomic, copy) NSString *requestId;
@property(nonatomic, strong) NSArray<NSDictionary<NSString *, NSString *> *> *actions;
@property(nonatomic) CGFloat topInset;
- (void)setPresentationMessage:(NSString *)message requestId:(NSString *)requestId actions:(NSArray<NSDictionary<NSString *, NSString *> *> *)actions;
- (void)focusFirstAction;
- (void)applyTopInset:(CGFloat)topInset;
@end

@implementation HibiNotchContentView
- (instancetype)initWithFrame:(NSRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.wantsLayer = YES;
    self.layer.cornerRadius = 30.0;
    self.layer.maskedCorners = kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner | kCALayerMinXMaxYCorner | kCALayerMaxXMaxYCorner;
    self.layer.masksToBounds = YES;
    self.layer.backgroundColor = NSColor.blackColor.CGColor;
    self.message = @"Hibi";
    self.actions = @[];
  }
  return self;
}
- (void)applyTopInset:(CGFloat)topInset {
  self.topInset = topInset;
  // Com câmera, o topo fica colado na borda da tela: arredonda só embaixo (layer não invertida, MinY = baixo).
  self.layer.maskedCorners = topInset > 0.0 ? (kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner) : (kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner | kCALayerMinXMaxYCorner | kCALayerMaxXMaxYCorner);
}
- (void)setPresentationMessage:(NSString *)message requestId:(NSString *)requestId actions:(NSArray<NSDictionary<NSString *, NSString *> *> *)actions {
  self.message = message.length > 0 ? message : @"Hibi";
  self.requestId = requestId;
  self.actions = actions;
  for (NSView *subview in self.subviews.copy) [subview removeFromSuperview];
  [self setNeedsDisplay:YES];
  for (NSUInteger index = 0; index < actions.count; index++) {
    NSDictionary *action = actions[index];
    NSButton *button = [NSButton buttonWithTitle:action[@"label"] target:nil action:nil];
    button.bezelStyle = NSBezelStyleRounded;
    button.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
    HibiNotchActionTarget *target = [HibiNotchActionTarget new];
    target.requestId = requestId;
    target.actionId = action[@"id"];
    button.target = target;
    button.action = @selector(activate:);
    objc_setAssociatedObject(button, @selector(activate:), target, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [self addSubview:button];
  }
  [self layout];
}
- (void)layout {
  [super layout];
  if (self.actions.count == 0) return;
  CGFloat gap = 8.0;
  CGFloat width = (self.bounds.size.width - 32.0 - gap * (self.actions.count - 1)) / self.actions.count;
  for (NSUInteger index = 0; index < self.subviews.count; index++) {
    self.subviews[index].frame = NSMakeRect(16.0 + index * (width + gap), 16.0, width, 34.0);
  }
}
- (void)focusFirstAction {
  NSView *firstAction = self.subviews.firstObject;
  if (firstAction) [self.window makeFirstResponder:firstAction];
}
- (BOOL)isAccessibilityElement { return YES; }
- (NSAccessibilityRole)accessibilityRole { return NSAccessibilityGroupRole; }
- (NSString *)accessibilityLabel { return self.message; }
- (void)drawRect:(NSRect)dirtyRect {
  [super drawRect:dirtyRect];
  NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
  paragraph.alignment = NSTextAlignmentCenter;
  BOOL passive = self.actions.count == 0;
  if (passive) paragraph.lineBreakMode = NSLineBreakByTruncatingTail;
  NSDictionary *attributes = @{ NSFontAttributeName: [NSFont systemFontOfSize:15 weight:NSFontWeightMedium], NSForegroundColorAttributeName: NSColor.whiteColor, NSParagraphStyleAttributeName: paragraph };
  // A faixa coberta pela câmera fica no topo (view não invertida); o texto só usa o que sobra.
  CGFloat usable = self.bounds.size.height - self.topInset;
  if (passive) {
    // Mede uma linha de referência: self.message pode ter \n e "contar" como várias linhas, jogando y para negativo.
    CGFloat lineHeight = ceil([@"Hg" sizeWithAttributes:attributes].height);
    CGFloat y = floor((usable - lineHeight) / 2.0);
    // \r, \r\n e U+2028 também quebram a linha e não são pegos por um replace só de \n.
    NSArray<NSString *> *messageLines = [self.message componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet];
    NSString *singleLine = [messageLines componentsJoinedByString:@" "];
    [singleLine drawInRect:NSMakeRect(16.0, y, self.bounds.size.width - 32.0, lineHeight) withAttributes:attributes];
    return;
  }
  CGFloat bottom = 66.0;
  [self.message drawInRect:NSMakeRect(16.0, bottom, self.bounds.size.width - 32.0, usable - bottom - 14.0) withAttributes:attributes];
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
  NSRect frame = NSMakeRect(0, 0, kHostWidth, kPassiveHeight);
  HibiNotchPanel *panel = [[HibiNotchPanel alloc] initWithContentRect:frame styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
  panel.opaque = NO;
  panel.backgroundColor = NSColor.clearColor;
  panel.hasShadow = YES;
  panel.movable = NO;
  panel.releasedWhenClosed = NO;
  panel.hidesOnDeactivate = NO;
  panel.level = NSStatusWindowLevel;
  panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorTransient | NSWindowCollectionBehaviorIgnoresCycle;
  panel.contentView = [[HibiNotchContentView alloc] initWithFrame:frame];
  gPanel = panel;
  gScreenObserver = [[NSNotificationCenter defaultCenter] addObserverForName:NSApplicationDidChangeScreenParametersNotification object:NSApp queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
    if (gPanel && gDisplayId) PositionHost(gDisplayId.unsignedLongLongValue);
  }];
  gKeyObserver = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
    if (gInteractive && gPanel.isKeyWindow && event.keyCode == 48) { [gPanel keyDown:event]; return nil; }
    if (gInteractive && gPanel.isKeyWindow && (event.keyCode == 36 || event.keyCode == 76) && [gPanel.firstResponder isKindOfClass:NSButton.class]) { [(NSButton *)gPanel.firstResponder performClick:nil]; return nil; }
    return event;
  }];
  return YES;
}

BOOL PositionHost(uint64_t displayId) {
  if (!gPanel) return NO;
  NSScreen *screen = ScreenForDisplayId(displayId);
  if (!screen) return NO;
  // safeAreaInsets.top é a faixa coberta pela câmera (0 em telas sem notch); somamos à altura
  // para o painel nascer abaixo da câmera em vez de escondido atrás dela.
  CGFloat inset = screen.safeAreaInsets.top;
  CGFloat height = (gInteractive ? kInteractiveHeight : kPassiveHeight) + inset;
  NSRect frame = NSMakeRect(NSMidX(screen.frame) - kHostWidth / 2.0, NSMaxY(screen.frame) - height, kHostWidth, height);
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
  CGFloat x = info[1].As<Napi::Number>().DoubleValue(); CGFloat electronY = info[2].As<Napi::Number>().DoubleValue(); CGFloat width = info[3].As<Napi::Number>().DoubleValue(); CGFloat height = info[4].As<Napi::Number>().DoubleValue(); if (width <= 0 || height <= 0) return Napi::Boolean::New(info.Env(), false);
  // Coordenadas globais do Electron e do Cocoa partem da tela principal, não da tela com foco.
  NSScreen *primary = NSScreen.screens.firstObject; if (!primary) return Napi::Boolean::New(info.Env(), false);
  [window setFrame:NSMakeRect(x, NSMaxY(primary.frame) - electronY - height, width, height) display:YES animate:NO]; [window setLevel:NSStatusWindowLevel]; [window setCollectionBehavior:NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary]; [window setOpaque:NO]; [window setHasShadow:NO]; return Napi::Boolean::New(info.Env(), true);
}
Napi::Value NativeHostAvailable(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value CreateHost(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) { Napi::TypeError::New(info.Env(), "Expected an action callback.").ThrowAsJavaScriptException(); return info.Env().Null(); }
  gRawEnv = info.Env(); gActionCallback.Reset(info[0].As<Napi::Function>(), 1); return Napi::Boolean::New(info.Env(), EnsureHost());
}
Napi::Value ShowHost(const Napi::CallbackInfo& info) {
  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsNumber() || !EnsureHost()) return Napi::Boolean::New(info.Env(), false);
  Napi::Object presentation = info[0].As<Napi::Object>(); if (!presentation.Has("requestId") || !presentation.Get("requestId").IsString() || !presentation.Has("actions") || !presentation.Get("actions").IsArray()) return Napi::Boolean::New(info.Env(), false);
  NSString *requestId = StringFromValue(presentation.Get("requestId")); Napi::Array actionsValue = presentation.Get("actions").As<Napi::Array>(); if (requestId.length == 0 || requestId.length > 128 || actionsValue.Length() > 4) return Napi::Boolean::New(info.Env(), false); if (actionsValue.Length() > 0) return Napi::Boolean::New(info.Env(), false);
  NSMutableArray<NSDictionary<NSString *, NSString *> *> *actions = [NSMutableArray array];
  for (uint32_t index = 0; index < actionsValue.Length(); index++) { Napi::Value rawAction = actionsValue.Get(index); if (!rawAction.IsObject()) return Napi::Boolean::New(info.Env(), false); Napi::Object action = rawAction.As<Napi::Object>(); if (!action.Has("id") || !action.Get("id").IsString() || !action.Has("label") || !action.Get("label").IsString()) return Napi::Boolean::New(info.Env(), false); NSString *actionId = StringFromValue(action.Get("id")); NSString *label = StringFromValue(action.Get("label")); if (actionId.length == 0 || actionId.length > 64 || label.length == 0 || label.length > 80) return Napi::Boolean::New(info.Env(), false); [actions addObject:@{ @"id": actionId, @"label": label }]; }
  NSString *message = presentation.Has("text") && presentation.Get("text").IsString() ? StringFromValue(presentation.Get("text")) : @"Hibi";
  gRequestId = requestId; gInteractive = actions.count > 0; HibiNotchContentView *view = HostContentView(); [view setPresentationMessage:message requestId:requestId actions:actions]; uint64_t displayId = static_cast<uint64_t>(info[1].As<Napi::Number>().Int64Value()); if (!PositionHost(displayId)) return Napi::Boolean::New(info.Env(), false); gPanel.ignoresMouseEvents = !gInteractive; if (gInteractive) { gPanel.styleMask &= ~NSWindowStyleMaskNonactivatingPanel; gPanel.becomesKeyOnlyIfNeeded = NO; [gPanel makeKeyAndOrderFront:nil]; [view focusFirstAction]; } else { gPanel.styleMask |= NSWindowStyleMaskNonactivatingPanel; gPanel.becomesKeyOnlyIfNeeded = YES; [gPanel orderFrontRegardless]; } return Napi::Boolean::New(info.Env(), true);
}
Napi::Value HideHost(const Napi::CallbackInfo& info) { if (!gPanel) return Napi::Boolean::New(info.Env(), false); gPanel.ignoresMouseEvents = YES; [gPanel orderOut:nil]; gRequestId = nil; gInteractive = NO; return Napi::Boolean::New(info.Env(), true); }
Napi::Value RepositionHost(const Napi::CallbackInfo& info) { if (!gPanel || info.Length() < 1 || !info[0].IsNumber()) return Napi::Boolean::New(info.Env(), false); return Napi::Boolean::New(info.Env(), PositionHost(static_cast<uint64_t>(info[0].As<Napi::Number>().Int64Value()))); }
Napi::Value DestroyHost(const Napi::CallbackInfo& info) { if (gPanel) { [gPanel orderOut:nil]; [gPanel close]; gPanel = nil; } if (gScreenObserver) { [[NSNotificationCenter defaultCenter] removeObserver:gScreenObserver]; gScreenObserver = nil; } if (gKeyObserver) { [NSEvent removeMonitor:gKeyObserver]; gKeyObserver = nil; } gRequestId = nil; gDisplayId = nil; gInteractive = NO; gActionCallback.Reset(); gRawEnv = nullptr; return Napi::Boolean::New(info.Env(), true); }
Napi::Value HostDiagnostics(const Napi::CallbackInfo& info) { Napi::Object result = Napi::Object::New(info.Env()); result.Set("available", Napi::Boolean::New(info.Env(), true)); result.Set("created", Napi::Boolean::New(info.Env(), gPanel != nil)); result.Set("visible", Napi::Boolean::New(info.Env(), gPanel != nil && gPanel.isVisible)); result.Set("interactive", Napi::Boolean::New(info.Env(), gInteractive)); if (gDisplayId) result.Set("displayId", Napi::Number::New(info.Env(), gDisplayId.unsignedLongLongValue)); if (gRequestId) result.Set("requestId", Napi::String::New(info.Env(), gRequestId.UTF8String)); if (gPanel) { NSRect frame = gPanel.frame; Napi::Object rect = Napi::Object::New(info.Env()); rect.Set("x", Napi::Number::New(info.Env(), frame.origin.x)); rect.Set("y", Napi::Number::New(info.Env(), frame.origin.y)); rect.Set("width", Napi::Number::New(info.Env(), frame.size.width)); rect.Set("height", Napi::Number::New(info.Env(), frame.size.height)); result.Set("frame", rect); result.Set("occluded", Napi::Boolean::New(info.Env(), (gPanel.occlusionState & NSWindowOcclusionStateVisible) == 0)); result.Set("activeSpace", Napi::Boolean::New(info.Env(), gPanel.onActiveSpace)); } return result; }
Napi::Value Teardown(const Napi::CallbackInfo& info) { DestroyHost(info); return info.Env().Undefined(); }

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("available", Napi::Function::New(env, Available)); exports.Set("promotionAvailable", Napi::Function::New(env, PromotionAvailable)); exports.Set("screenGeometry", Napi::Function::New(env, ScreenGeometry)); exports.Set("place", Napi::Function::New(env, Place)); exports.Set("teardown", Napi::Function::New(env, Teardown));
  exports.Set("nativeHostAvailable", Napi::Function::New(env, NativeHostAvailable)); exports.Set("createHost", Napi::Function::New(env, CreateHost)); exports.Set("showHost", Napi::Function::New(env, ShowHost)); exports.Set("hideHost", Napi::Function::New(env, HideHost)); exports.Set("repositionHost", Napi::Function::New(env, RepositionHost)); exports.Set("destroyHost", Napi::Function::New(env, DestroyHost)); exports.Set("hostDiagnostics", Napi::Function::New(env, HostDiagnostics)); return exports;
}
NODE_API_MODULE(hibi_notch, Init)
