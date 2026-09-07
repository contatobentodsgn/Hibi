#include <napi.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>

static NSString *Text(const Napi::Value &value, Napi::Env env, const char *label) {
  if (!value.IsString()) { Napi::TypeError::New(env, label).ThrowAsJavaScriptException(); return nil; }
  std::string text = value.As<Napi::String>().Utf8Value();
  if (text.empty() || text.size() > 8192) { Napi::RangeError::New(env, label).ThrowAsJavaScriptException(); return nil; }
  return [NSString stringWithUTF8String:text.c_str()];
}

static NSDictionary *Query(NSString *account) {
  return @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService: @"com.hibi.study.ai", (__bridge id)kSecAttrAccount: account };
}

static Napi::Value Available(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }

static Napi::Value Set(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (info.Length() < 2) { Napi::TypeError::New(env, "Expected account and secret.").ThrowAsJavaScriptException(); return env.Null(); }
    NSString *account = Text(info[0], env, "Invalid Keychain account."); NSString *secret = Text(info[1], env, "Invalid API key."); if (!account || !secret) return env.Null();
    NSData *data = [secret dataUsingEncoding:NSUTF8StringEncoding]; NSDictionary *query = Query(account);
    NSDictionary *update = @{ (__bridge id)kSecValueData: data };
    OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)update);
    if (status == errSecItemNotFound) { NSMutableDictionary *add = [query mutableCopy]; add[(__bridge id)kSecValueData] = data; status = SecItemAdd((__bridge CFDictionaryRef)add, nullptr); }
    if (status != errSecSuccess) { Napi::Error::New(env, [[NSString stringWithFormat:@"Keychain write failed (%d).", (int)status] UTF8String]).ThrowAsJavaScriptException(); return env.Null(); }
    return Napi::Boolean::New(env, true);
  }
}

static Napi::Value Get(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (info.Length() < 1) { Napi::TypeError::New(env, "Expected account.").ThrowAsJavaScriptException(); return env.Null(); }
    NSString *account = Text(info[0], env, "Invalid Keychain account."); if (!account) return env.Null();
    NSMutableDictionary *query = [Query(account) mutableCopy]; query[(__bridge id)kSecReturnData] = @YES; query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef result = nullptr; OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    if (status == errSecItemNotFound) return env.Null();
    if (status != errSecSuccess) { Napi::Error::New(env, [[NSString stringWithFormat:@"Keychain read failed (%d).", (int)status] UTF8String]).ThrowAsJavaScriptException(); return env.Null(); }
    NSData *data = (__bridge_transfer NSData *)result; NSString *secret = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return Napi::String::New(env, secret ? secret.UTF8String : "");
  }
}

static Napi::Value Has(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (info.Length() < 1) { Napi::TypeError::New(env, "Expected account.").ThrowAsJavaScriptException(); return env.Null(); }
    NSString *account = Text(info[0], env, "Invalid Keychain account."); if (!account) return env.Null();
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)Query(account), nullptr);
    return Napi::Boolean::New(env, status == errSecSuccess);
  }
}

static Napi::Value Remove(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (info.Length() < 1) { Napi::TypeError::New(env, "Expected account.").ThrowAsJavaScriptException(); return env.Null(); }
    NSString *account = Text(info[0], env, "Invalid Keychain account."); if (!account) return env.Null();
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)Query(account));
    return Napi::Boolean::New(env, status == errSecSuccess || status == errSecItemNotFound);
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) { exports.Set("available", Napi::Function::New(env, Available)); exports.Set("set", Napi::Function::New(env, Set)); exports.Set("get", Napi::Function::New(env, Get)); exports.Set("has", Napi::Function::New(env, Has)); exports.Set("remove", Napi::Function::New(env, Remove)); return exports; }
NODE_API_MODULE(hibi_keychain, Init)
