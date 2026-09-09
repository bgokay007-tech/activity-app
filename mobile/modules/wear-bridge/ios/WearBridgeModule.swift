import ExpoModulesCore

// Apple Watch köprüsü henüz yapılmadı (ayrı bir görev) — iOS derlemesinin
// bozulmaması için no-op bir modül. Android tarafındaki gerçek Wear OS
// köprüsüyle aynı JS arayüzünü (index.ts) sağlar.
public class WearBridgeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WearBridge")

        Events("onMatchUpdate", "onWatchPoint")

        AsyncFunction("isWatchConnected") { () -> Bool in
            return false
        }

        AsyncFunction("startHuaweiScoreSession") { (_: [String: String]) -> Bool in
            return false
        }

        AsyncFunction("updateHuaweiScoreSession") { (_: [String: String]) -> Bool in
            return false
        }

        AsyncFunction("stopHuaweiScoreSession") { () in
        }
    }
}
