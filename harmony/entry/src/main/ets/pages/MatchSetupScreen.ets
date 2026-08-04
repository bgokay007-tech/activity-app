import { Sport, PadelPointMode, MatchConfig, defaultMatchConfig } from '../scoring/MatchEngine';

// wear/.../MatchSetupScreen.kt (Wear OS/Compose) ile aynı akışın ArkUI portu:
// spor + (padel ise) sayım modu seçilir, "▶" ile maç başlatılır.
@Component
export struct MatchSetupScreen {
  onStart: (config: MatchConfig) => void = () => {};

  @State sport: Sport = Sport.TENNIS;
  @State padelMode: PadelPointMode = PadelPointMode.TRADITIONAL;

  build() {
    Column() {
      Text('Spor').fontSize(12).fontColor('#AAAAAA').margin({ bottom: 4 })

      this.SportChip('🎾 Tenis', this.sport === Sport.TENNIS, () => { this.sport = Sport.TENNIS; })
      this.SportChip('🏓 Padel', this.sport === Sport.PADEL, () => { this.sport = Sport.PADEL; })
      this.SportChip('🏐 Voleybol', this.sport === Sport.VOLLEYBALL, () => { this.sport = Sport.VOLLEYBALL; })

      if (this.sport === Sport.PADEL) {
        Text('Sayım').fontSize(12).fontColor('#AAAAAA').margin({ top: 8, bottom: 4 })
        this.SportChip('15-30-40', this.padelMode === PadelPointMode.TRADITIONAL, () => { this.padelMode = PadelPointMode.TRADITIONAL; })
        this.SportChip('1-2-3...', this.padelMode === PadelPointMode.SIMPLE, () => { this.padelMode = PadelPointMode.SIMPLE; })
      }

      Button('▶')
        .fontSize(18)
        .margin({ top: 12 })
        .onClick(() => {
          this.onStart(defaultMatchConfig(this.sport, this.padelMode));
        })
    }
    .width('100%')
    .height('100%')
    .padding({ left: 12, right: 12, top: 20, bottom: 20 })
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  SportChip(label: string, selected: boolean, onTap: () => void) {
    Text(label)
      .fontSize(13)
      .fontColor(selected ? Color.White : '#CCCCCC')
      .backgroundColor(selected ? '#6D28D9' : '#2A2A2A')
      .borderRadius(14)
      .padding({ left: 12, right: 12, top: 4, bottom: 4 })
      .margin({ top: 2, bottom: 2 })
      .onClick(onTap)
  }
}
