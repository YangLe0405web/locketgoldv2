import Foundation
import UIKit
import Capacitor
import CoreML
import StableDiffusion
import ZIPFoundation

@objc(StudioViewController)
public class StudioViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() { bridge?.registerPluginInstance(StudioNative()) }
}

@objc(StudioNative)
public class StudioNative: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StudioNative"
    public let jsName = "StudioNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "modelStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transform", returnType: CAPPluginReturnPromise)
    ]
    private var generating = false
    private let work = DispatchQueue(label: "studio.coreml", qos: .userInitiated)
    private let models = StudioModels()

    @objc func request(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https",
              let host = url.host, host == "api.locketcamera.com" || host == "nominatim.openstreetmap.org" || host.hasSuffix(".googleapis.com") else {
            call.reject("Địa chỉ dịch vụ không được hỗ trợ."); return
        }
        var request = URLRequest(url: url)
        request.httpMethod = call.getString("method") ?? "GET"
        request.timeoutInterval = Double(call.getInt("timeout") ?? 30000) / 1000
        for (key, value) in call.getObject("headers") ?? [:] { request.setValue(String(describing:value), forHTTPHeaderField:key) }
        if let body = call.getString("body") {
            request.httpBody = call.getBool("binary") == true ? Data(base64Encoded: body) : body.data(using: .utf8)
        }
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error { call.reject("Kết nối dịch vụ thất bại: \(error.localizedDescription)"); return }
            guard let response = response as? HTTPURLResponse else { call.reject("Không có phản hồi HTTP."); return }
            var headers: [String:String] = [:]
            for (key,value) in response.allHeaderFields { headers[String(describing:key).lowercased()] = String(describing:value) }
            call.resolve(["status":response.statusCode, "headers":headers, "body":String(data:data ?? Data(),encoding:.utf8) ?? ""])
        }.resume()
    }

    @objc func shareImage(_ call: CAPPluginCall) {
        guard let encoded=call.getString("data"), let data=Data(base64Encoded:encoded) else { call.reject("Ảnh không hợp lệ."); return }
        let rawName=call.getString("name") ?? "locket.png"
        let name=URL(fileURLWithPath:rawName).lastPathComponent
        let url=FileManager.default.temporaryDirectory.appendingPathComponent(name.isEmpty ? "locket.png" : name)
        do { try data.write(to:url,options:.atomic) } catch { call.reject("Không lưu được ảnh."); return }
        DispatchQueue.main.async {
            let sheet=UIActivityViewController(activityItems:[url],applicationActivities:nil)
            sheet.popoverPresentationController?.sourceView=self.bridge?.viewController?.view
            sheet.completionWithItemsHandler={ _,_,_,error in
                try? FileManager.default.removeItem(at:url)
                if let error=error { call.reject(error.localizedDescription) } else { call.resolve() }
            }
            self.bridge?.viewController?.present(sheet,animated:true)
        }
    }

    @objc func modelStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["ready":self.models.resources != nil,"downloading":self.models.downloading,
            "downloadPercent":self.models.percent,"message":self.models.message,"busy":self.generating]) }
    }
    @objc func downloadModel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.models.start(); call.resolve() }
    }
    @objc func transform(_ call: CAPPluginCall) {
        let prompts = ["santa":"portrait of the same person as Santa Claus, red Christmas coat and hat, fluffy white beard, detailed photograph",
                       "tire":"portrait of the same person wearing a black rubber tire mascot costume, stacked car tires, human face visible",
                       "anime":"anime portrait, beautiful hand drawn illustration", "clay":"clay character portrait, stop motion, soft studio light",
                       "idol":"portrait photograph, pop idol stage outfit, studio lighting", "fantasy":"royal portrait, ornate crown, fantasy costume"]
        guard let style=call.getString("style"), let prompt=prompts[style],
              let source=call.getString("image"), let encoded=source.split(separator:",",maxSplits:1).last,
              let bytes=Data(base64Encoded:String(encoded)), let input=UIImage(data:bytes) else { call.reject("Chọn ảnh và kiểu biến hình hợp lệ."); return }
        DispatchQueue.main.async {
            guard !self.generating else { call.reject("Đang tạo một ảnh, vui lòng chờ."); return }
            guard let resources=self.models.resources else { call.reject("Bấm Tải AI về iPhone trước khi biến hình."); return }
            self.generating=true
            UIApplication.shared.isIdleTimerDisabled=true
            self.work.async {
                defer { DispatchQueue.main.async { self.generating=false; UIApplication.shared.isIdleTimerDisabled=false } }
                do {
                    let format=UIGraphicsImageRendererFormat(); format.scale=1
                    let normalized=UIGraphicsImageRenderer(size:CGSize(width:512,height:512),format:format).image { _ in
                        let scale=max(512/input.size.width,512/input.size.height)
                        let w=input.size.width*scale, h=input.size.height*scale
                        input.draw(in:CGRect(x:(512-w)/2,y:(512-h)/2,width:w,height:h))
                    }
                    let settings=MLModelConfiguration(); settings.computeUnits = .cpuAndNeuralEngine
                    let pipeline=try StableDiffusionPipeline(resourcesAt:resources,controlNet:[],configuration:settings,reduceMemory:true)
                    defer { pipeline.unloadResources() }
                    var config=StableDiffusionPipeline.Configuration(prompt:prompt)
                    config.startingImage=normalized.cgImage
                    config.strength=0.55; config.stepCount=16; config.guidanceScale=7
                    config.seed=UInt32.random(in:0...UInt32.max)
                    config.schedulerType = .dpmSolverMultistepScheduler
                    let images=try pipeline.generateImages(configuration:config)
                    guard let image=images.first ?? nil, let png=UIImage(cgImage:image).pngData() else {
                        call.reject("Mô hình chưa trả ảnh phù hợp. Thử ảnh khác."); return
                    }
                    call.resolve(["image":"data:image/png;base64,"+png.base64EncodedString()])
                } catch { call.reject("AI iPhone chưa tạo được ảnh: \(error.localizedDescription)") }
            }
        }
    }
}

private final class StudioModels: NSObject, URLSessionDownloadDelegate {
    private let base=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("StudioAI")
    private lazy var session=URLSession(configuration:.default,delegate:self,delegateQueue:nil)
    var downloading=false
    var percent=0
    var message="Chưa tải mô hình Core ML (~1,6 GB). Dùng Wi-Fi và giữ app mở."
    var resources: URL? {
        let root=base.appendingPathComponent("model")
        guard FileManager.default.fileExists(atPath:base.appendingPathComponent("ready").path),
              let enumerator=FileManager.default.enumerator(at:root,includingPropertiesForKeys:nil) else { return nil }
        for case let url as URL in enumerator where url.lastPathComponent == "vocab.json" {
            let directory=url.deletingLastPathComponent()
            if FileManager.default.fileExists(atPath:directory.appendingPathComponent("VAEEncoder.mlmodelc").path) { return directory }
        }
        return nil
    }
    func start() {
        guard !downloading, resources == nil else { return }
        downloading=true; message="Đang tải mô hình về iPhone…"
        let url=URL(string:"https://huggingface.co/apple/coreml-stable-diffusion-v1-5-palettized/resolve/main/coreml-stable-diffusion-v1-5-palettized_split_einsum_v2_compiled.zip")!
        var request=URLRequest(url:url); request.timeoutInterval=120
        session.downloadTask(with:request).resume()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten:Int64,totalBytesWritten:Int64,totalBytesExpectedToWrite:Int64) {
        DispatchQueue.main.async {
            self.percent=totalBytesExpectedToWrite>0 ? Int(totalBytesWritten*100/totalBytesExpectedToWrite):0
            self.message="Đã tải \(totalBytesWritten/1024/1024) MB mô hình (\(self.percent)%)."
        }
    }
    func urlSession(_ session:URLSession, downloadTask:URLSessionDownloadTask,didFinishDownloadingTo location:URL) {
        do {
            guard let response=downloadTask.response as? HTTPURLResponse,response.statusCode==200 else { throw URLError(.badServerResponse) }
            let manager=FileManager.default
            try manager.createDirectory(at:base,withIntermediateDirectories:true)
            let archive=base.appendingPathComponent("model.zip")
            try? manager.removeItem(at:archive)
            try manager.moveItem(at:location,to:archive)
            DispatchQueue.main.async { self.message="Đang giải nén mô hình trên iPhone…" }
            let destination=base.appendingPathComponent("model")
            try? manager.removeItem(at:destination)
            try manager.unzipItem(at:archive,to:destination)
            try Data("ready".utf8).write(to:base.appendingPathComponent("ready"),options:.atomic)
            guard resources != nil else { try? manager.removeItem(at:base.appendingPathComponent("ready")); throw URLError(.cannotDecodeContentData) }
            try? manager.removeItem(at:archive)
            var excluded=base; var values=URLResourceValues();values.isExcludedFromBackup=true;try? excluded.setResourceValues(values)
            DispatchQueue.main.async { self.downloading=false;self.percent=100;self.message="Đã tải mô hình Core ML. Có thể thử tạo ảnh." }
        } catch { DispatchQueue.main.async { self.downloading=false;self.message="Chưa cài được mô hình: \(error.localizedDescription). Bấm tải lại." } }
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,didCompleteWithError error:Error?) {
        if let error=error { DispatchQueue.main.async { self.downloading=false;self.message="Tải bị gián đoạn: \(error.localizedDescription). Bấm tải lại." } }
    }
}
