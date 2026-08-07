// Express controller'ları (sendJoinRequest, respondToJoin gibi) HTTP dışından — cron job'lardan
// veya demo bot mantığından — gerçek bir istek gibi çağırmayı sağlar. Bu controller'lar sadece
// req.userId/req.params/req.body okuyor, req.headers vb. hiçbir şeye dokunmuyor; bu yüzden sahte
// bir req/res ile çağırmak validasyon/bildirim/socket mantığının TAMAMINI (gerçek kullanıcı
// akışıyla birebir) yeniden kullanmamızı sağlıyor — team-sport/derece/cinsiyet kurallarını
// demo botlar için ayrıca yeniden yazmaya gerek kalmıyor.
export async function invokeControllerAs(controllerFn, { userId, params = {}, body = {} }) {
    const req = { userId, params, body };
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    let error = null;
    await controllerFn(req, res, (err) => { error = err; });
    if (error) throw error;
    return { status: res.statusCode, body: res.body };
}
