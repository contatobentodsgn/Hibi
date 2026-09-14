#include <napi.h>
#import <EventKit/EventKit.h>
#import <Foundation/Foundation.h>

static EKEventStore *store;
static const NSTimeInterval kMaximumRange = 366.0 * 24.0 * 60.0 * 60.0;

static EKEventStore *EventStore() {
  static dispatch_once_t once;
  dispatch_once(&once, ^{ store = [[EKEventStore alloc] init]; });
  return store;
}

static NSString *Text(const Napi::Value &value, Napi::Env env, const char *label, NSUInteger maximum = 8192) {
  if (!value.IsString()) { Napi::TypeError::New(env, label).ThrowAsJavaScriptException(); return nil; }
  std::string text = value.As<Napi::String>().Utf8Value();
  if (text.empty() || text.size() > maximum) { Napi::RangeError::New(env, label).ThrowAsJavaScriptException(); return nil; }
  return [NSString stringWithUTF8String:text.c_str()];
}

static NSDate *Date(const Napi::Value &value, Napi::Env env, const char *label) {
  NSString *text = Text(value, env, label); if (!text) return nil;
  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  NSDate *date = [formatter dateFromString:text];
  if (!date) Napi::TypeError::New(env, label).ThrowAsJavaScriptException();
  return date;
}

static NSString *ISOString(NSDate *date) {
  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
  return [formatter stringFromDate:date];
}

static bool HasCalendarAccess() {
  EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
  if (status == EKAuthorizationStatusAuthorized) return true;
  if (@available(macOS 14.0, *)) return status == EKAuthorizationStatusFullAccess;
  return false;
}

static const char *AuthorizationStatus() {
  EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
  if (status == EKAuthorizationStatusNotDetermined) return "not-determined";
  if (status == EKAuthorizationStatusDenied) return "denied";
  if (status == EKAuthorizationStatusRestricted) return "restricted";
  if (status == EKAuthorizationStatusAuthorized) return "full-access";
  if (@available(macOS 14.0, *)) {
    if (status == EKAuthorizationStatusFullAccess) return "full-access";
    if (status == EKAuthorizationStatusWriteOnly) return "write-only";
  }
  return "unavailable";
}

static Napi::Value Available(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), true); }
static Napi::Value Status(const Napi::CallbackInfo& info) { return Napi::String::New(info.Env(), AuthorizationStatus()); }

static Napi::Value RequestFullAccess(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  EKEventStore *eventStore = EventStore();
  void (^finish)(BOOL, NSError *) = ^(BOOL granted, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (granted) { deferred.Resolve(Napi::Boolean::New(env, true)); return; }
      NSString *message = error.localizedDescription ?: @"Calendar access was not granted.";
      deferred.Reject(Napi::Error::New(env, message.UTF8String).Value());
    });
  };
  if (@available(macOS 14.0, *)) [eventStore requestFullAccessToEventsWithCompletion:finish];
  else [eventStore requestAccessToEntityType:EKEntityTypeEvent completion:finish];
  return deferred.Promise();
}

static Napi::Value ListCalendars(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (!HasCalendarAccess()) { Napi::Error::New(env, "Calendar full access is required.").ThrowAsJavaScriptException(); return env.Null(); }
    NSArray<EKCalendar *> *calendars = [EventStore() calendarsForEntityType:EKEntityTypeEvent];
    Napi::Array result = Napi::Array::New(env, calendars.count);
    NSUInteger index = 0;
    for (EKCalendar *calendar in calendars) {
      if (!calendar.calendarIdentifier.length || !calendar.title.length) continue;
      Napi::Object entry = Napi::Object::New(env);
      entry.Set("id", calendar.calendarIdentifier.UTF8String);
      entry.Set("label", calendar.title.UTF8String);
      if (calendar.source.title.length) entry.Set("sourceLabel", calendar.source.title.UTF8String);
      entry.Set("writable", Napi::Boolean::New(env, calendar.allowsContentModifications));
      result.Set(index++, entry);
    }
    return result;
  }
}

static Napi::Value ListEvents(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (!HasCalendarAccess()) { Napi::Error::New(env, "Calendar full access is required.").ThrowAsJavaScriptException(); return env.Null(); }
    if (info.Length() < 1 || !info[0].IsObject()) { Napi::TypeError::New(env, "Calendar event query is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object input = info[0].As<Napi::Object>();
    NSDate *start = Date(input.Get("start"), env, "Calendar event start is invalid.");
    NSDate *end = Date(input.Get("end"), env, "Calendar event end is invalid.");
    if (!start || !end) return env.Null();
    if ([end timeIntervalSinceDate:start] <= 0 || [end timeIntervalSinceDate:start] > kMaximumRange) { Napi::RangeError::New(env, "Calendar event range is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    NSMutableArray<EKCalendar *> *selected = [NSMutableArray array];
    if (input.Has("calendarIds")) {
      Napi::Value ids = input.Get("calendarIds");
      if (!ids.IsArray() || ids.As<Napi::Array>().Length() > 200) { Napi::TypeError::New(env, "Calendar selection is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
      for (uint32_t i = 0; i < ids.As<Napi::Array>().Length(); i++) {
        NSString *identifier = Text(ids.As<Napi::Array>().Get(i), env, "Calendar identifier is invalid.", 240); if (!identifier) return env.Null();
        EKCalendar *calendar = [EventStore() calendarWithIdentifier:identifier]; if (calendar) [selected addObject:calendar];
      }
    }
    NSPredicate *predicate = [EventStore() predicateForEventsWithStartDate:start endDate:end calendars:selected.count ? selected : nil];
    NSArray<EKEvent *> *events = [EventStore() eventsMatchingPredicate:predicate];
    Napi::Array result = Napi::Array::New(env, MIN(events.count, 5000));
    NSUInteger index = 0;
    for (EKEvent *event in events) {
      if (index >= 5000 || !event.eventIdentifier.length || !event.startDate || !event.endDate) continue;
      Napi::Object entry = Napi::Object::New(env);
      entry.Set("id", event.eventIdentifier.UTF8String);
      entry.Set("calendarId", event.calendar.calendarIdentifier.UTF8String ?: "");
      entry.Set("title", (event.title ?: @"Untitled event").UTF8String);
      entry.Set("startsAt", ISOString(event.startDate).UTF8String);
      entry.Set("endsAt", ISOString(event.endDate).UTF8String);
      entry.Set("allDay", Napi::Boolean::New(env, event.allDay));
      entry.Set("writable", Napi::Boolean::New(env, event.calendar.allowsContentModifications));
      if (event.lastModifiedDate) entry.Set("revision", ISOString(event.lastModifiedDate).UTF8String);
      result.Set(index++, entry);
    }
    return result;
  }
}

static Napi::Value SaveEvent(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (!HasCalendarAccess()) { Napi::Error::New(env, "Calendar full access is required.").ThrowAsJavaScriptException(); return env.Null(); }
    if (info.Length() < 1 || !info[0].IsObject()) { Napi::TypeError::New(env, "Calendar event is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object input = info[0].As<Napi::Object>();
    NSString *calendarId = Text(input.Get("calendarId"), env, "Calendar identifier is invalid.", 240);
    NSString *title = Text(input.Get("title"), env, "Calendar event title is invalid.", 240);
    NSDate *start = Date(input.Get("start"), env, "Calendar event start is invalid.");
    NSDate *end = Date(input.Get("end"), env, "Calendar event end is invalid.");
    if (!calendarId || !title || !start || !end) return env.Null();
    if ([end timeIntervalSinceDate:start] <= 0 || [end timeIntervalSinceDate:start] > kMaximumRange) { Napi::RangeError::New(env, "Calendar event range is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    EKCalendar *calendar = [EventStore() calendarWithIdentifier:calendarId];
    if (!calendar || !calendar.allowsContentModifications) { Napi::Error::New(env, "The selected calendar cannot be changed.").ThrowAsJavaScriptException(); return env.Null(); }
    EKEvent *event = [EKEvent eventWithEventStore:EventStore()];
    event.calendar = calendar; event.title = title; event.startDate = start; event.endDate = end;
    if (input.Has("allDay") && input.Get("allDay").IsBoolean()) event.allDay = input.Get("allDay").As<Napi::Boolean>().Value();
    NSError *error = nil;
    if (![EventStore() saveEvent:event span:EKSpanThisEvent commit:YES error:&error]) { Napi::Error::New(env, (error.localizedDescription ?: @"Calendar event could not be saved.").UTF8String).ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object result = Napi::Object::New(env); result.Set("id", event.eventIdentifier.UTF8String); if (event.lastModifiedDate) result.Set("revision", ISOString(event.lastModifiedDate).UTF8String); return result;
  }
}

static Napi::Value UpdateEvent(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (!HasCalendarAccess()) { Napi::Error::New(env, "Calendar full access is required.").ThrowAsJavaScriptException(); return env.Null(); }
    if (info.Length() < 1 || !info[0].IsObject()) { Napi::TypeError::New(env, "Calendar event is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object input = info[0].As<Napi::Object>();
    NSString *identifier = Text(input.Get("id"), env, "Calendar event identifier is invalid.", 240);
    NSString *title = Text(input.Get("title"), env, "Calendar event title is invalid.", 240);
    NSDate *start = Date(input.Get("start"), env, "Calendar event start is invalid.");
    NSDate *end = Date(input.Get("end"), env, "Calendar event end is invalid.");
    if (!identifier || !title || !start || !end) return env.Null();
    if ([end timeIntervalSinceDate:start] <= 0 || [end timeIntervalSinceDate:start] > kMaximumRange) { Napi::RangeError::New(env, "Calendar event range is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    EKEvent *event = [EventStore() eventWithIdentifier:identifier];
    if (!event || !event.calendar.allowsContentModifications) { Napi::Error::New(env, "The selected calendar event cannot be changed.").ThrowAsJavaScriptException(); return env.Null(); }
    if (input.Has("expectedRevision")) {
      NSString *expectedRevision = Text(input.Get("expectedRevision"), env, "Calendar event revision is invalid.", 240); if (!expectedRevision) return env.Null();
      NSString *actualRevision = event.lastModifiedDate ? ISOString(event.lastModifiedDate) : @"";
      if (![expectedRevision isEqualToString:actualRevision]) { Napi::Error::New(env, "Calendar event changed elsewhere. Review the conflict.").ThrowAsJavaScriptException(); return env.Null(); }
    }
    event.title = title; event.startDate = start; event.endDate = end;
    if (input.Has("allDay") && input.Get("allDay").IsBoolean()) event.allDay = input.Get("allDay").As<Napi::Boolean>().Value();
    NSError *error = nil;
    if (![EventStore() saveEvent:event span:EKSpanThisEvent commit:YES error:&error]) { Napi::Error::New(env, (error.localizedDescription ?: @"Calendar event could not be updated.").UTF8String).ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object result = Napi::Object::New(env); result.Set("id", event.eventIdentifier.UTF8String); if (event.lastModifiedDate) result.Set("revision", ISOString(event.lastModifiedDate).UTF8String); return result;
  }
}

static Napi::Value RemoveEvent(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env(); @autoreleasepool {
    if (!HasCalendarAccess()) { Napi::Error::New(env, "Calendar full access is required.").ThrowAsJavaScriptException(); return env.Null(); }
    if (info.Length() < 1) { Napi::TypeError::New(env, "Calendar event identifier is invalid.").ThrowAsJavaScriptException(); return env.Null(); }
    NSString *identifier = Text(info[0], env, "Calendar event identifier is invalid.", 240); if (!identifier) return env.Null();
    EKEvent *event = [EventStore() eventWithIdentifier:identifier];
    if (!event || !event.calendar.allowsContentModifications) { Napi::Error::New(env, "The selected calendar event cannot be removed.").ThrowAsJavaScriptException(); return env.Null(); }
    NSError *error = nil;
    if (![EventStore() removeEvent:event span:EKSpanThisEvent commit:YES error:&error]) { Napi::Error::New(env, (error.localizedDescription ?: @"Calendar event could not be removed.").UTF8String).ThrowAsJavaScriptException(); return env.Null(); }
    return Napi::Boolean::New(env, true);
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("available", Napi::Function::New(env, Available));
  exports.Set("authorizationStatus", Napi::Function::New(env, Status));
  exports.Set("requestFullAccess", Napi::Function::New(env, RequestFullAccess));
  exports.Set("listCalendars", Napi::Function::New(env, ListCalendars));
  exports.Set("listEvents", Napi::Function::New(env, ListEvents));
  exports.Set("saveEvent", Napi::Function::New(env, SaveEvent));
  exports.Set("updateEvent", Napi::Function::New(env, UpdateEvent));
  exports.Set("removeEvent", Napi::Function::New(env, RemoveEvent));
  return exports;
}
NODE_API_MODULE(hibi_calendar, Init)
