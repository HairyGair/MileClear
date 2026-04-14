#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SiriModule, NSObject)

RCT_EXTERN_METHOD(setAccessToken:
                  (NSString *)token
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearAccessToken:
                  (RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
