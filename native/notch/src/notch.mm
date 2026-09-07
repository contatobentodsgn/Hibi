#include <napi.h>
#import <Cocoa/Cocoa.h>

// This bridge intentionally uses documented AppKit only. Electron handle recovery
// is host-version dependent, so unsupported handles safely report false.
Napi::Value Available(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value PromotionAvailable(const Napi::CallbackInfo& info) {
  // A normal NSWindow can be placed at the display's top edge with public AppKit.
  // This is the supported notch-adjacent surface; it does not access the camera
  // housing's private WindowServer layer.
  return Napi::Boolean::New(info.Env(), true);
}
Napi::Value ScreenGeometry(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); Napi::Array output = Napi::Array::New(env);
  NSUInteger index = 0;
  for (NSScreen *screen in NSScreen.screens) {
    NSRect frame = screen.frame; NSEdgeInsets insets = screen.safeAreaInsets;
    NSRect left = screen.auxiliaryTopLeftArea; NSRect right = screen.auxiliaryTopRightArea;
    Napi::Object item = Napi::Object::New(env);
    item.Set("index", Napi::Number::New(env, index++));
    item.Set("frame", Napi::Object::New(env)); item.Get("frame").As<Napi::Object>().Set("x", Napi::Number::New(env, frame.origin.x)); item.Get("frame").As<Napi::Object>().Set("y", Napi::Number::New(env, frame.origin.y)); item.Get("frame").As<Napi::Object>().Set("width", Napi::Number::New(env, frame.size.width)); item.Get("frame").As<Napi::Object>().Set("height", Napi::Number::New(env, frame.size.height));
    item.Set("safeAreaTop", Napi::Number::New(env, insets.top));
    item.Set("hasCameraHousing", Napi::Boolean::New(env, !NSEqualRects(left, NSZeroRect) || !NSEqualRects(right, NSZeroRect)));
    output.Set(index - 1, item);
  }
  return output;
}
Napi::Value Place(const Napi::CallbackInfo& info) {
  if (info.Length() < 5 || !info[0].IsBuffer() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()) {
    Napi::TypeError::New(info.Env(), "Expected native handle and x, y, width, height.").ThrowAsJavaScriptException(); return info.Env().Null();
  }
  auto handle = info[0].As<Napi::Buffer<uint8_t>>();
  if (handle.Length() < sizeof(void*)) return Napi::Boolean::New(info.Env(), false);
  // Electron documents its macOS native handle as NSView*. Resolve its owning
  // NSWindow before applying window-level AppKit configuration.
  id __unsafe_unretained nativeObject = *reinterpret_cast<id __unsafe_unretained *>(handle.Data());
  if (!nativeObject) return Napi::Boolean::New(info.Env(), false);
  NSWindow *window = nil;
  if ([nativeObject isKindOfClass:NSView.class]) window = [(NSView *)nativeObject window];
  else if ([nativeObject isKindOfClass:NSWindow.class]) window = (NSWindow *)nativeObject;
  if (!window) return Napi::Boolean::New(info.Env(), false);

  CGFloat x = info[1].As<Napi::Number>().DoubleValue();
  CGFloat electronY = info[2].As<Napi::Number>().DoubleValue();
  CGFloat width = info[3].As<Napi::Number>().DoubleValue();
  CGFloat height = info[4].As<Napi::Number>().DoubleValue();
  if (width <= 0 || height <= 0) return Napi::Boolean::New(info.Env(), false);

  NSScreen *screen = nil;
  for (NSScreen *candidate in NSScreen.screens) {
    if (NSPointInRect(NSMakePoint(x + width / 2.0, electronY + height / 2.0), candidate.frame)) { screen = candidate; break; }
  }
  if (!screen) screen = NSScreen.mainScreen;
  if (!screen) return Napi::Boolean::New(info.Env(), false);

  // Electron uses a top-left screen origin; AppKit uses a bottom-left origin.
  NSRect frame = NSMakeRect(x, NSMaxY(screen.frame) - electronY - height, width, height);
  [window setFrame:frame display:YES animate:NO];
  [window setLevel:NSStatusWindowLevel];
  [window setCollectionBehavior:NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary];
  [window setOpaque:NO];
  [window setHasShadow:NO];
  return Napi::Boolean::New(info.Env(), true);
}
Napi::Value Teardown(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Object Init(Napi::Env env, Napi::Object exports) { exports.Set("available", Napi::Function::New(env, Available)); exports.Set("promotionAvailable", Napi::Function::New(env, PromotionAvailable)); exports.Set("screenGeometry", Napi::Function::New(env, ScreenGeometry)); exports.Set("place", Napi::Function::New(env, Place)); exports.Set("teardown", Napi::Function::New(env, Teardown)); return exports; }
NODE_API_MODULE(hibi_notch, Init)
