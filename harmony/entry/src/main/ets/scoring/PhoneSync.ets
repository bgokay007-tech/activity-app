import { wearEngine } from '@kit.WearEngine';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { MatchConfig, MatchState, Team, gamePointLabel, sportName, teamName } from './MatchEngine';

/**
 * Huawei Wear Engine Kit (P2P) üzerinden telefona canlı maç güncellemesi
 * gönderir — Wear OS tarafındaki wear/.../PhoneSync.kt ile aynı JSON
 * sözleşmesi (bkz. mobile/modules/wear-bridge/android/.../HuaweiWearEngineListener.kt),
 * böylece telefondaki JS tarafı (index.ts / onMatchUpdate) saatin Wear OS mu
 * yoksa HarmonyOS mu olduğunu bilmek zorunda kalmıyor.
 *
 * TODO(gerçek cihaz kaydı): Bu köprü, telefon uygulamasının Huawei Developer
 * konsolunda "Wear Engine" servisi açılarak kaydedilmesini ve imza
 * sertifikası parmak izinin aşağıya girilmesini gerektiriyor. Kayıt
 * yapılmadan gönderim sessizce başarısız olur (bkz. catch bloğu).
 */

const PHONE_BUNDLE_NAME = 'com.activity.app';
const PHONE_FINGERPRINT = 'TODO_HUAWEI_DEVELOPER_KONSOLUNDAN_ALINACAK_SHA256_FINGERPRINT';

let authorized = false;

async function ensureAuthorized(context: common.Context): Promise<boolean> {
  if (authorized) return true;
  try {
    const authClient = wearEngine.getAuthClient(context);
    const request: wearEngine.AuthorizationRequest = { permissions: [wearEngine.Permission.DEVICE_MANAGER] };
    await authClient.requestAuthorization(request);
    authorized = true;
    return true;
  } catch (err) {
    hilog.error(0x0000, 'AcTiViTy', 'Wear Engine yetkilendirme hatasi: %{public}s', JSON.stringify(err as BusinessError));
    return false;
  }
}

export async function sendUpdate(context: common.Context, config: MatchConfig, state: MatchState): Promise<void> {
  const ok = await ensureAuthorized(context);
  if (!ok) return;

  const winner = state.matchWinner === null ? null : teamName(state.matchWinner);
  const payloadText = JSON.stringify({
    sport: sportName(config.sport),
    pointLabelA: gamePointLabel(config, state, Team.A),
    pointLabelB: gamePointLabel(config, state, Team.B),
    gamesA: state.gamesA,
    gamesB: state.gamesB,
    setsA: state.setsWonA,
    setsB: state.setsWonB,
    matchWinner: winner,
  });

  const appParam: wearEngine.P2pAppParam = {
    remoteApp: { bundleName: PHONE_BUNDLE_NAME, fingerprint: PHONE_FINGERPRINT },
    transformLocalAppInfo: false,
  };
  const message: wearEngine.P2pMessage = {
    content: new util.TextEncoder().encodeInto(payloadText),
  };

  try {
    const deviceClient = wearEngine.getDeviceClient(context);
    const p2pClient = wearEngine.getP2pClient(context);
    const devices = await deviceClient.getConnectedDevices();
    for (const device of devices) {
      await p2pClient.sendMessage(device.randomId, appParam, message);
    }
  } catch (err) {
    // Telefon bağlı değil / eşleştirme yapılmamış / mesaj gitmedi — sessizce yok
    // say, saatteki skorlama akışını bozmasın (bkz. wear/PhoneSync.kt aynı yaklaşım).
    hilog.error(0x0000, 'AcTiViTy', 'Telefona skor gonderilemedi: %{public}s', JSON.stringify(err as BusinessError));
  }
}
