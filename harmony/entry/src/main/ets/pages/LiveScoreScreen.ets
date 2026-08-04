import { MatchConfig, MatchState, Sport, Team, gamePointLabel, teamName } from '../scoring/MatchEngine';

// wear/.../LiveScoreScreen.kt (Wear OS/Compose) ile aynı tasarım: üst yarı Takım
// A, alt yarı Takım B — dokununca o takıma sayı yazılır, ortadaki "↩" son sayıyı
// geri alır (bkz. Index.ets — olay listesi tek kaynak, MatchEngine.computeState).
@Component
export struct LiveScoreScreen {
  config: MatchConfig | null = null;
  state: MatchState | null = null;
  onAddPoint: (team: Team) => void = () => {};
  onUndo: () => void = () => {};
  onFinish: () => void = () => {};

  build() {
    if (this.state === null || this.config === null) {
      // Olmaması gereken durum — Index.ets sadece maç başladıktan sonra bu ekranı gösteriyor.
    } else if (this.state.matchWinner !== null) {
      this.MatchFinished(this.state.matchWinner)
    } else {
      Column() {
        this.TeamHalf(
          'A',
          gamePointLabel(this.config, this.state, Team.A),
          this.state.gamesA,
          this.state.setsWonA,
          this.config.sport !== Sport.VOLLEYBALL,
          '#1E3A5F',
          () => this.onAddPoint(Team.A),
        )

        Row() {
          Button('↩')
            .fontSize(14)
            .height(24)
            .backgroundColor('#333333')
            .fontColor(Color.White)
            .onClick(() => this.onUndo())
        }
        .width('100%')
        .height(28)
        .backgroundColor(Color.Black)
        .justifyContent(FlexAlign.Center)

        this.TeamHalf(
          'B',
          gamePointLabel(this.config, this.state, Team.B),
          this.state.gamesB,
          this.state.setsWonB,
          this.config.sport !== Sport.VOLLEYBALL,
          '#5F1E2E',
          () => this.onAddPoint(Team.B),
        )
      }
      .width('100%')
      .height('100%')
    }
  }

  @Builder
  TeamHalf(label: string, pointLabel: string, games: number, sets: number, showGames: boolean, bg: string, onTap: () => void) {
    Column() {
      Text(`${label} · Set ${sets}`).fontSize(10).fontColor('#CCCCCC')
      Text(pointLabel).fontSize(30).fontWeight(FontWeight.Bold).fontColor(Color.White).margin({ top: 2, bottom: 2 })
      if (showGames) {
        Text(`Oyun ${games}`).fontSize(9).fontColor('#AAAAAA')
      }
    }
    .width('100%')
    .layoutWeight(1)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(bg)
    .onClick(onTap)
  }

  @Builder
  MatchFinished(winner: Team) {
    Column() {
      Text('🏆').fontSize(28)
      Text(`Takım ${teamName(winner)} kazandı`).fontSize(14).fontColor(Color.White).margin({ top: 4 })
      Button('Bitti').margin({ top: 8 }).onClick(() => this.onFinish())
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }
}
