import { common } from '@kit.AbilityKit';
import { MatchConfig, MatchState, Team, computeState } from '../scoring/MatchEngine';
import { sendUpdate } from '../scoring/PhoneSync';
import { MatchSetupScreen } from './MatchSetupScreen';
import { LiveScoreScreen } from './LiveScoreScreen';

// wear/.../MainActivity.kt + ScoreViewModel.kt'nin ArkTS portu: olay listesi
// (kim sayı aldı, sırayla) tek kaynak — güncel skor her zaman bu listeden
// türetilir (bkz. MatchEngine.computeState), "geri al" == son olayı silip
// yeniden hesaplamak. Her durum değişiminde Wear Engine Kit ile (PhoneSync)
// telefondaki WearBridge modülüne anlık güncelleme gönderilir.
@Entry
@Component
struct Index {
  @State matchStarted: boolean = false;
  @State config: MatchConfig | null = null;
  @State state: MatchState | null = null;
  private events: Team[] = [];

  private syncToPhone(config: MatchConfig, state: MatchState): void {
    const context = getContext(this) as common.Context;
    sendUpdate(context, config, state);
  }

  private startMatch(config: MatchConfig): void {
    this.config = config;
    this.events = [];
    this.state = computeState(config, this.events);
    this.matchStarted = true;
    this.syncToPhone(config, this.state);
  }

  private addPoint(team: Team): void {
    const config = this.config;
    if (config === null || this.state === null || this.state.matchWinner !== null) return;
    this.events.push(team);
    this.state = computeState(config, this.events);
    this.syncToPhone(config, this.state);
  }

  private undoLastPoint(): void {
    const config = this.config;
    if (config === null || this.events.length === 0) return;
    this.events.pop();
    this.state = computeState(config, this.events);
    this.syncToPhone(config, this.state);
  }

  private finishMatch(): void {
    this.config = null;
    this.state = null;
    this.events = [];
    this.matchStarted = false;
  }

  build() {
    Column() {
      if (!this.matchStarted) {
        MatchSetupScreen({
          onStart: (config: MatchConfig) => this.startMatch(config),
        })
      } else {
        LiveScoreScreen({
          config: this.config,
          state: this.state,
          onAddPoint: (team: Team) => this.addPoint(team),
          onUndo: () => this.undoLastPoint(),
          onFinish: () => this.finishMatch(),
        })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }
}
