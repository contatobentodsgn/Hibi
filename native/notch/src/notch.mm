#include <napi.h>
#import <Cocoa/Cocoa.h>

// This bridge intentionally uses documented AppKit only. Electron handle recovery
// is host-version dependent, so unsupported handles safely report false.
Napi::Value Available(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
Napi::Value Place(const Napi::CallbackInfo& info) {
  if (info.Length() < 5 || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()) {
    Napi::TypeError::New(info.Env(), "Expected native handle and x, y, width, height.").ThrowAsJavaScriptException(); return info.Env().Null();
  }
  // No private WindowServer APIs: a host integration may supply a supported NSWindow
  // resolver later. Returning false activates the Electron degraded fallback.
  return Napi::Boolean::New(info.Env(), false);
}
Napi::Value Teardown(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Object Init(Napi::Env env, Napi::Object exports) { exports.Set("available", Napi::Function::New(env, Available)); exports.Set("place", Napi::Function::New(env, Place)); exports.Set("teardown", Napi::Function::New(env, Teardown)); return exports; }
NODE_API_MODULE(hibi_notch, Init)
