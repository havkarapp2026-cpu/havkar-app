import CoreLocation
import Foundation
import WebKit

/**
 * iOS background location bridge for consented personal trips.
 * Queues points for the WebView to drain/sync. Never tracks silently.
 */
final class TravelLocationBridge: NSObject, CLLocationManagerDelegate, WKScriptMessageHandler {
    static let shared = TravelLocationBridge()

    private let manager = CLLocationManager()
    private let queueKey = "havkar_travel_gps_queue"
    private var tripId: String = ""
    private weak var webView: WKWebView?

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 25
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        manager.showsBackgroundLocationIndicator = true
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        let content = webView.configuration.userContentController
        content.removeScriptMessageHandler(forName: "havkarTravel")
        content.add(self, name: "havkarTravel")
        let js = """
        window.HAVKAR_IOS_TRAVEL = {
          startBackground: function(tripId){
            window.webkit.messageHandlers.havkarTravel.postMessage({cmd:'start', tripId:String(tripId||'')});
            return {ok:true,mode:'ios_cllocation'};
          },
          stopBackground: function(){
            window.webkit.messageHandlers.havkarTravel.postMessage({cmd:'stop'});
            return {ok:true};
          },
          drainQueuedPoints: function(){
            return new Promise(function(resolve){
              window.__havkarIosTravelDrain = function(payload){ resolve(payload); };
              window.webkit.messageHandlers.havkarTravel.postMessage({cmd:'drain'});
            });
          },
          platform: function(){ return 'ios'; }
        };
        """
        content.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "havkarTravel",
              let body = message.body as? [String: Any],
              let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "start":
            let id = (body["tripId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !id.isEmpty, !id.hasPrefix("local-") else { return }
            tripId = id
            requestAndStart()
        case "stop":
            stop()
        case "drain":
            let payload = drainJSON()
            DispatchQueue.main.async {
                self.webView?.evaluateJavaScript("window.__havkarIosTravelDrain && window.__havkarIosTravelDrain(\(payload))")
            }
        default:
            break
        }
    }

    private func requestAndStart() {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestAlwaysAuthorization()
            return
        }
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }

    private func stop() {
        manager.stopUpdatingLocation()
        tripId = ""
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if !tripId.isEmpty {
            requestAndStart()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, !tripId.isEmpty else { return }
        var obj: [String: Any] = [
            "trip_id": tripId,
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracy_m": loc.horizontalAccuracy,
            "recorded_at": ISO8601DateFormatter().string(from: loc.timestamp),
            "source": "ios_cllocation"
        ]
        if loc.speed >= 0 { obj["speed_mps"] = loc.speed }
        if loc.course >= 0 { obj["heading_deg"] = loc.course }
        if loc.altitude != 0 { obj["altitude_m"] = loc.altitude }
        append(obj)
    }

    private func append(_ point: [String: Any]) {
        var arr = loadQueue()
        arr.append(point)
        if arr.count > 4000 {
            arr.removeFirst(arr.count - 4000)
        }
        if let data = try? JSONSerialization.data(withJSONObject: arr),
           let raw = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(raw, forKey: queueKey)
        }
    }

    private func loadQueue() -> [[String: Any]] {
        guard let raw = UserDefaults.standard.string(forKey: queueKey),
              let data = raw.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        return arr
    }

    private func drainJSON() -> String {
        let arr = loadQueue()
        UserDefaults.standard.set("[]", forKey: queueKey)
        let payload: [String: Any] = ["ok": true, "points": arr]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let raw = String(data: data, encoding: .utf8) {
            return raw
        }
        return #"{"ok":true,"points":[]}"#
    }
}
