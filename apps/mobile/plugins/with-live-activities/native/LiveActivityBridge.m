#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

// Attach the push-to-start token listener at launch, before any JavaScript
// runs. iOS hands the token over exactly once and the sequence does not
// replay, so a listener that only starts when JS first asks can miss it
// forever (Apple bug FB21158660). +load runs at image load; the work itself
// waits for didFinishLaunching, the earliest point ActivityKit is usable.
// The Swift class is looked up by its explicit Objective-C name so this does
// not depend on the generated -Swift.h header, whose name follows the project.
@interface MileClearLiveActivityLaunchHook : NSObject
@end

@implementation MileClearLiveActivityLaunchHook

+ (void)load {
  [[NSNotificationCenter defaultCenter]
      addObserverForName:UIApplicationDidFinishLaunchingNotification
                  object:nil
                   queue:[NSOperationQueue mainQueue]
              usingBlock:^(NSNotification *_Nonnull note) {
        Class cls = NSClassFromString(@"LiveActivityTokenBootstrap");
        SEL sel = NSSelectorFromString(@"start");
        if (cls && [cls respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
          [cls performSelector:sel];
#pragma clang diagnostic pop
        }
      }];
}

@end

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(isSupported:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startActivity:
                  (NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:
                  (NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivityWithSummary:
                  (NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getActiveActivityId:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getLiveActivityPhase:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(markClassified:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPendingLiveActivityDecision:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearPendingLiveActivityDecision:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPushToStartToken:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
