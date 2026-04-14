#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VisionOcrModule, NSObject)

RCT_EXTERN_METHOD(recognizeText:
                  (NSString *)imageUri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
