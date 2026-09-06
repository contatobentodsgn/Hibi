#include <napi.h>
#import <Cocoa/Cocoa.h>

// This bridge intentionally uses documented AppKit only. Electron handle recovery
// is host-version dependent, so unsupported handles safely report false.
Napi::Value Available(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value PromotionAvailable(const Napi::CallbackInfo& info) {
  // AppKit deliberately provides no public API to place third-party content in
  // the camera housing. Hibi exposes this truthfully instead of using CGS/SkyLight.
  return Napi::Boolean::New(info.Env(), false);
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
  if (info.Length() < 5 || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()) {
    Napi::TypeError::New(info.Env(), "Expected native handle and x, y, width, height.").ThrowAsJavaScriptException(); return info.Env().Null();
  }
  // No private WindowServer APIs: a host integration may supply a supported NSWindow
  // resolver later. Returning false activates the Electron degraded fallback.
  return Napi::Boolean::New(info.Env(), false);
}
Napi::Value Teardown(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Object Init(Napi::Env env, Napi::Object exports) { exports.Set("available", Napi::Function::New(env, Available)); exports.Set("promotionAvailable", Napi::Function::New(env, PromotionAvailable)); exports.Set("screenGeometry", Napi::Function::New(env, ScreenGeometry)); exports.Set("place", Napi::Function::New(env, Place)); exports.Set("teardown", Napi::Function::New(env, Teardown)); return exports; }
NODE_API_MODULE(hibi_notch, Init)
