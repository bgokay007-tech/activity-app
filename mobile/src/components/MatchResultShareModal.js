import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Alert, ScrollView, Image, useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useT from '../hooks/useT';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import {
    buildMatchSharePayload, buildSharerDigimonPayload, matchShareMessage,
    buildShareHealthFromWorkout, BRAND_LETTER_COLORS, UTR_SHARE_SUBS,
} from '../utils/matchShareCard';
import {
    buildTournamentMatchSharePayload,
    tournamentMatchShareMessage,
    tournamentMatchToShareMatch,
} from '../utils/tournamentMatchShareCard';
import { fetchMatchWorkoutStats, rivalMatchTimeWindow } from '../utils/matchHealthSync';
import { shareBackgroundToDataUrl } from '../utils/matchShareBackground';
import {
    shareToWhatsApp,
    shareToWhatsAppStatus,
    shareToInstagramStory,
    shareViaSystemSheet,
    ensureGallerySave,
    PLAY_STORE_URL,
} from '../utils/directShare';
import api, { BASE_URL } from '../services/api';

const W = 1080;
const H = 1920;
const ASSET_HOST = BASE_URL.replace(/\/api\/?$/, '');

/** Uzak avatar → canvas Image için data URL (WebView CORS'u bypass). */
async function avatarToDataUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        let abs = url;
        if (abs.startsWith('/')) abs = `${ASSET_HOST}${abs}`;
        const dest = `${FileSystem.cacheDirectory}share-avatar-${Date.now()}.jpg`;
        const dl = await FileSystem.downloadAsync(abs, dest);
        if (!dl?.uri) return null;
        const b64 = await FileSystem.readAsStringAsync(dl.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        const lower = String(abs).toLowerCase();
        const mime = lower.includes('.png') ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${b64}`;
    } catch {
        return null;
    }
}

/**
 * 9:16 skor kartı — spor/zemin arka planı + yarı saydam koyu overlay,
 * skor tablosu + canlı takip istatistikleri + saat/sağlık workout paneli.
 * IG üst chrome için TOP boşluk.
 * Digimon ön/arka: AcTiViTy iki yanında (üst=MAÇ SONUCU, yükseklik içeriğe sıkı, gap 5).
 * Meta (tarih/saat/süre/konum) KAZANDI altında tek satır, panelsiz.
 */
function cardHtml(p, bgDataUrl, avatarDataUrl) {
    const brand = p.brand || 'AcTiViTy';
    const colorsArr = p.brandColors || BRAND_LETTER_COLORS;
    const setPairs = (p.lines || []).map((line) => {
        const m = String(line).match(/(\d+)\s*[-–]\s*(\d+)/);
        return m ? [m[1], m[2]] : ['', ''];
    });
    const stats = p.shareStats || null;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, initial-scale=1"/>
</head><body style="margin:0;background:#0B0C10">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
(function(){
  function go(bgImg, avImg){
    try{
      var canvas=document.getElementById('c');
      var ctx=canvas.getContext('2d');
      var W=${W}, H=${H}, TOP=220;

      // Spor-yüzey arka plan (toprak/sert/salon/plaj/padel…) — yarı saydam overlay ile okunur
      if(bgImg){
        var s=Math.max(W/bgImg.width, H/bgImg.height);
        var dw=bgImg.width*s, dh=bgImg.height*s;
        ctx.drawImage(bgImg, (W-dw)/2, (H-dh)/2, dw, dh);
      } else {
        ctx.fillStyle='#0B0C10'; ctx.fillRect(0,0,W,H);
      }
      ctx.fillStyle='rgba(8,10,14,0.72)';
      ctx.fillRect(0,0,W,H);
      var vg=ctx.createLinearGradient(0,0,0,H);
      vg.addColorStop(0,'rgba(8,10,14,0.55)');
      vg.addColorStop(0.35,'rgba(8,10,14,0.35)');
      vg.addColorStop(1,'rgba(8,10,14,0.82)');
      ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

      function text(str,x,y,size,color,align,weight){
        ctx.fillStyle=color||'#F4F1EA';
        ctx.font=(weight||'900')+' '+size+'px sans-serif';
        ctx.textAlign=align||'center';
        ctx.textBaseline='alphabetic';
        ctx.fillText(String(str||''),x,y);
      }
      function roundRect(x,y,w,h,r){
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
        ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
      }
      function panel(x,y,w,h){
        roundRect(x,y,w,h,22);
        ctx.fillStyle='rgba(22,24,31,0.78)'; ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2; ctx.stroke();
      }
      function nameLines(label, maxW, size){
        ctx.font='900 '+size+'px sans-serif';
        var raw=String(label||'');
        if(raw.indexOf(' & ')>=0){
          return raw.split(' & ').map(function(p,i,a){ return i<a.length-1 ? p+' &' : p; });
        }
        if(ctx.measureText(raw).width<=maxW) return [raw];
        var words=raw.split(/\\s+/), lines=[], cur='';
        words.forEach(function(w){
          var t=cur ? cur+' '+w : w;
          if(ctx.measureText(t).width<=maxW) cur=t;
          else { if(cur) lines.push(cur); cur=w; }
        });
        if(cur) lines.push(cur);
        return lines.length?lines:[raw];
      }
      function wrap(str,maxW,size){
        ctx.font='700 '+size+'px sans-serif';
        var words=String(str||'').split(/\\s+/), lines=[], cur='';
        words.forEach(function(w){
          var t=cur?cur+' '+w:w;
          if(ctx.measureText(t).width<=maxW) cur=t;
          else { if(cur) lines.push(cur); cur=w; }
        });
        if(cur) lines.push(cur);
        return lines.length?lines:[String(str||'')];
      }

      var brand=${JSON.stringify(brand)};
      var cols=${JSON.stringify(colorsArr)};
      var sharer=${JSON.stringify((p.includeDigimon && p.sharerCard) ? p.sharerCard : null)};
      var digPad=5;
      var CTA_Y=1715;

      function digimonShell(x,y,w,h,accent){
        roundRect(x,y,w,h,14);
        ctx.fillStyle='rgba(18,20,28,0.92)'; ctx.fill();
        ctx.strokeStyle=accent||'rgba(200,245,74,0.55)'; ctx.lineWidth=2.5; ctx.stroke();
        roundRect(x+digPad,y+digPad,w-digPad*2,h-digPad*2,10);
        ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1.2; ctx.stroke();
      }

      // Uygulama adı — ortada; Digimon yanlarda (üst=marka üstü, alt=KAZANDI altı)
      ctx.font='900 82px sans-serif'; ctx.textAlign='left';
      var brandMetric=ctx.measureText(brand);
      var brandAscent=(brandMetric.actualBoundingBoxAscent!=null)?brandMetric.actualBoundingBoxAscent:Math.round(82*0.78);
      var brandTop=TOP-brandAscent;
      var totalW=0;
      for(var i=0;i<brand.length;i++) totalW+=ctx.measureText(brand[i]).width+3;
      var brandLeft=(W-totalW)/2;
      var brandRight=brandLeft+totalW;
      var bx=brandLeft;
      for(var i=0;i<brand.length;i++){
        ctx.fillStyle=cols[i%cols.length];
        ctx.fillText(brand[i], bx, TOP);
        bx+=ctx.measureText(brand[i]).width+3;
      }

      // Spor dalı — BÜYÜK HARF
      var sportUp=${JSON.stringify(p.sportUpper || String(p.sport || '').toUpperCase())};
      text(sportUp, 540, TOP+48, 42, '#C8F54A', 'center', '900');

      // MAÇ SONUCU — kazanan ismiyle çakışmasın diye yukarı
      var badge=${JSON.stringify(p.resultBadge||'MATCH RESULT')};
      ctx.font='900 22px sans-serif';
      var bw=Math.max(260, ctx.measureText(badge).width+48);
      roundRect((W-bw)/2, TOP+58, bw, 40, 20);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(badge, W/2, TOP+85, 22, '#0B0C10', 'center', '900');

      var isUpcoming=${JSON.stringify(!!p.isUpcoming)};
      var isDraw=${JSON.stringify(p.winnerSide==='draw')};
      var tournName=${JSON.stringify(p.tournamentName||'')};
      var tournRound=${JSON.stringify(p.tournamentRound||'')};
      // Digimon yanlarda → orta sütun dar; skor bloğu marka/rozet altına inebilir
      var digSideGap=5;
      var approxDigW=sharer?Math.min(228, Math.max(140, brandLeft-digSideGap-12)):0;
      var centerMaxW=sharer?Math.max(280, W-2*(approxDigW+digSideGap+10)):940;
      // Rozet (MAÇ SONUCU) ile kazanan isimleri çakışmasın — blok biraz aşağı
      var ny=TOP+158;
      if(tournName){
        var tLines=nameLines(tournName, centerMaxW, 36);
        tLines.forEach(function(ln){ text(ln, 540, ny, 36, '#F4F1EA', 'center', '900'); ny+=42; });
        if(tournRound){ text(tournRound, 540, ny, 24, '#A8A29A', 'center', '800'); ny+=34; }
        ny+=6;
      }

      var name=${JSON.stringify(p.isUpcoming ? '' : (p.resultLabel||''))};
      var won=${JSON.stringify(p.isUpcoming ? (p.wonWord||'VS') : (p.wonWord||'WON'))};
      var kazandiBottom=ny;
      if(!isUpcoming && name){
        var nLines=nameLines(name, centerMaxW, 56);
        nLines.forEach(function(ln){ text(ln, 540, ny, 56, '#F4F1EA', 'center', '900'); ny+=60; });
        // Beraberlikte KAZANDI yazma
        if(!isDraw){
          var wonBaseline=ny+4;
          text(won, 540, wonBaseline, 48, '#C8F54A', 'center', '900');
          ctx.font='900 48px sans-serif';
          var wonM=ctx.measureText(won);
          var wonDesc=(wonM.actualBoundingBoxDescent!=null)?wonM.actualBoundingBoxDescent:Math.round(48*0.22);
          kazandiBottom=wonBaseline+wonDesc;
          ny=kazandiBottom+8;
        } else {
          kazandiBottom=ny;
          ny+=10;
        }
      } else if(isUpcoming){
        var wonBaseline2=ny+4;
        text(won, 540, wonBaseline2, 48, '#C8F54A', 'center', '900');
        ctx.font='900 48px sans-serif';
        var wonM2=ctx.measureText(won);
        var wonDesc2=(wonM2.actualBoundingBoxDescent!=null)?wonM2.actualBoundingBoxDescent:Math.round(48*0.22);
        kazandiBottom=wonBaseline2+wonDesc2;
        ny=kazandiBottom+8;
      }

      // Meta: KAZANDI altı boşluk — tarih saat süre konum tek satır, panelsiz
      var metaLine=[];
      if(${JSON.stringify(!!p.dateStr)}) metaLine.push(${JSON.stringify(p.dateStr||'')});
      if(${JSON.stringify(!!p.timeStr)}) metaLine.push(${JSON.stringify(p.timeStr||'')});
      if(${JSON.stringify(!!p.durationLabel)}) metaLine.push(${JSON.stringify(p.durationLabel||'')});
      if(${JSON.stringify(!!p.surface)}) metaLine.push(${JSON.stringify(p.surface||'')});
      var placeName=${JSON.stringify(p.placeName||'')};
      var placeRegion=${JSON.stringify(p.placeRegion||'')};
      var locLine='';
      if(placeName) locLine=placeName;
      else if(${JSON.stringify(!!p.place)} && !placeRegion) locLine=${JSON.stringify(p.place||'')};
      if(placeRegion) locLine=locLine ? (locLine+' '+placeRegion) : placeRegion;
      if(locLine) metaLine.push(locLine);
      if(metaLine.length){
        var metaGap=5;
        var metaFs=22;
        var metaMaxW=Math.min(centerMaxW, Math.max(280, brandRight-brandLeft+80));
        function metaWidth(fs){
          ctx.font='700 '+fs+'px sans-serif';
          var tw=0;
          metaLine.forEach(function(m,idx){ tw+=ctx.measureText(m).width; if(idx) tw+=metaGap; });
          return tw;
        }
        while(metaFs>13 && metaWidth(metaFs)>metaMaxW) metaFs-=1;
        var metaTotal=metaWidth(metaFs);
        var mx=(W-metaTotal)/2;
        var my=ny+18;
        metaLine.forEach(function(m){
          text(m, mx, my, metaFs, '#E7E5E4', 'left', '700');
          mx+=ctx.measureText(m).width+metaGap;
        });
        ny=my+14;
      }

      // Digimon ÖN/ARKA — üst = MAÇ SONUCU rozeti üstü; yükseklik içeriğe sıkı (altta boşluk yok)
      if(sharer){
        var badgeTop=TOP+58;
        var digTop=badgeTop;
        var frontW=approxDigW;
        var fx=brandLeft-digSideGap-frontW;
        if(fx<10){ fx=10; frontW=Math.max(140, brandLeft-digSideGap-fx); }
        var frontCx=fx+frontW/2;
        var frontMaxW=frontW-digPad*2;
        var dispName=sharer.alias||sharer.name||sharer.username||'';
        var nameFs=17;
        ctx.font='900 '+nameFs+'px sans-serif';
        while(nameFs>12 && ctx.measureText(dispName).width>frontMaxW){
          nameFs-=1; ctx.font='900 '+nameFs+'px sans-serif';
        }
        var eloLines=0;
        if(sharer.isUtr){
          if(sharer.showSinglesLine) eloLines++;
          if(sharer.showDoublesLine) eloLines++;
        } else if(sharer.elo) eloLines=1;
        var hasRanks=!!sharer.showRanks;
        var isUtrRank=!!sharer.isUtr && hasRanks;
        var ar=30;
        var lblFs=12;
        // İçerik yüksekliği — altta boş pad kalmasın
        var frontContentH=digPad+lblFs+6+8+ar*2+6+nameFs+4+15+16+(eloLines?eloLines*17:0)+digPad+4;
        var digTh=40;
        var backContentH=digPad+14+digTh+8+((sharer.titles||0)>0?24:0)+(hasRanks?(isUtrRank?14:0)+3*18:0)+digPad+4;
        var digH=Math.max(frontContentH, backContentH);
        digimonShell(fx,digTop,frontW,digH,'#C8F54A');
        text(sharer.labels.front||'PLAYER', frontCx, digTop+digPad+lblFs+1, lblFs, '#C8F54A', 'center', '900');
        var ax=frontCx, ay=digTop+digPad+lblFs+8+ar;
        ctx.beginPath(); ctx.arc(ax,ay,ar,0,Math.PI*2);
        ctx.fillStyle='#1C1F2A'; ctx.fill();
        ctx.strokeStyle='#C8F54A'; ctx.lineWidth=2.5; ctx.stroke();
        if(avImg){
          ctx.save();
          ctx.beginPath(); ctx.arc(ax,ay,ar-1.5,0,Math.PI*2); ctx.closePath(); ctx.clip();
          var as=Math.max((ar*2)/(avImg.width||1),(ar*2)/(avImg.height||1));
          var aw=(avImg.width||1)*as, ah=(avImg.height||1)*as;
          ctx.drawImage(avImg, ax-aw/2, ay-ah/2, aw, ah);
          ctx.restore();
        } else {
          var ini=(sharer.name||sharer.username||'?').charAt(0).toUpperCase();
          text(ini, ax, ay+Math.round(ar*0.35), Math.round(ar*0.85), '#F4F1EA', 'center', '900');
        }
        var tyFront=ay+ar+nameFs+2;
        text(dispName, frontCx, tyFront, nameFs, '#F4F1EA', 'center', '900');
        tyFront+=Math.max(15, nameFs+1);
        text((sharer.emoji||'')+' '+(sharer.sport||''), frontCx, tyFront, 12, '#A8A29A', 'center', '700');
        tyFront+=16;
        if(sharer.isUtr){
          if(sharer.showSinglesLine){
            text((sharer.labels.singles||'Singles')+' '+(sharer.singlesElo||'—'), frontCx, tyFront, 13, '#C8F54A', 'center', '900');
            tyFront+=17;
          }
          if(sharer.showDoublesLine){
            text((sharer.labels.doubles||'Doubles')+' '+(sharer.doublesElo||'—'), frontCx, tyFront, 13, '#C8F54A', 'center', '900');
          }
        } else if(sharer.elo){
          text(sharer.elo, frontCx, tyFront, 14, '#C8F54A', 'center', '900');
        }

        // ARKA YÜZ — markanın sağı, aynı üst/yükseklik
        var backW=Math.min(frontW, Math.max(140, W-12-(brandRight+digSideGap)));
        var bx2=brandRight+digSideGap;
        if(bx2+backW>W-10){ backW=Math.max(120, W-10-bx2); }
        var backH=digH;
        digimonShell(bx2,digTop,backW,backH,'#A855F7');
        var backCx=bx2+backW/2;
        text(sharer.labels.back||'STATS', backCx, digTop+digPad+12, 11, '#C084FC', 'center', '900');
        var digTiles=[
          { label:sharer.labels.matches||'Matches', value:String(sharer.totalMatches||0), color:'#38BDF8' },
          { label:sharer.labels.wins||'Wins', value:String(sharer.wins||0), color:'#4ADE80' },
          { label:sharer.labels.losses||'Losses', value:String(sharer.losses||0), color:'#F87171' },
        ];
        var digCols=3;
        var digGap=4;
        var digTw=(backW-digPad*2-(digCols-1)*digGap)/digCols;
        digTiles.forEach(function(tile,i){
          var tx=bx2+digPad+i*(digTw+digGap);
          var ty=digTop+digPad+20;
          roundRect(tx,ty,digTw,digTh,6);
          ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fill();
          text(tile.value, tx+digTw/2, ty+Math.round(digTh*0.48), 16, tile.color, 'center', '900');
          text(tile.label, tx+digTw/2, ty+digTh-6, 9, '#A8A29A', 'center', '700');
        });
        var afterStatsY=digTop+digPad+20+digTh+6;
        if((sharer.titles||0)>0){
          roundRect(bx2+digPad, afterStatsY, backW-digPad*2, 20, 6);
          ctx.fillStyle='rgba(250,204,21,0.12)'; ctx.fill();
          text('🏆 '+(sharer.labels.titles||'Titles')+'  '+String(sharer.titles), backCx, afterStatsY+14, 11, '#FACC15', 'center', '800');
          afterStatsY+=24;
        }
        if(hasRanks){
          var sShort=sharer.labels.singlesShort||'S';
          var dShort=sharer.labels.doublesShort||'D';
          var colS=bx2+backW-digPad-(isUtrRank?72:36);
          var colD=bx2+backW-digPad;
          var rankFs=11;
          if(isUtrRank){
            text(sShort, colS, afterStatsY+10, 10, '#C8F54A', 'right', '900');
            text(dShort, colD, afterStatsY+10, 10, '#C084FC', 'right', '900');
            afterStatsY+=14;
          }
          var rankRows=[
            { lbl:sharer.labels.rankLocal||'📍 Local', s:sharer.rankLocalS||'—', d:sharer.rankLocalD||'—' },
            { lbl:sharer.labels.rankNational||'🇹🇷 National', s:sharer.rankNationalS||'—', d:sharer.rankNationalD||'—' },
            { lbl:sharer.labels.rankIntl||'🌍 International', s:sharer.rankInternationalS||'—', d:sharer.rankInternationalD||'—' },
          ];
          var rankRowH=18;
          rankRows.forEach(function(r,i){
            var ry=afterStatsY+rankRowH-2+i*rankRowH;
            if(ry>digTop+backH-digPad-2) return;
            text(r.lbl, bx2+digPad, ry, rankFs, '#A8A29A', 'left', '700');
            text(r.s, colS, ry, rankFs+1, '#FACC15', 'right', '900');
            if(isUtrRank) text(r.d, colD, ry, rankFs+1, '#FACC15', 'right', '900');
          });
        }
      }

      // Skor (dar) + isteğe bağlı sağlık — aynı satır
      var pairs=${JSON.stringify(setPairs)};
      var leftRoster=${JSON.stringify(Array.isArray(p.leftRoster) && p.leftRoster.length ? p.leftRoster : [{ name: p.leftLabel || '', elo: p.leftElo || '', rank: p.leftRank || null }])};
      var rightRoster=${JSON.stringify(Array.isArray(p.rightRoster) && p.rightRoster.length ? p.rightRoster : [{ name: p.rightLabel || '', elo: p.rightElo || '', rank: p.rightRank || null }])};
      var leftElo=${JSON.stringify(p.leftElo||'')};
      var rightElo=${JSON.stringify(p.rightElo||'')};
      var includeHealth=${JSON.stringify(!!p.includeHealth)};
      var healthTiles=${JSON.stringify((p.shareStats && p.shareStats.healthTiles) || [])};
      var healthTitle=${JSON.stringify(p.healthTitle || 'HEALTH')};
      var healthSrc=${JSON.stringify((p.shareStats && p.shareStats.workoutSource) || '')};
      var showHealth=includeHealth && healthTiles.length>0;
      var scorePadX=5, scorePadBottom=3;
      var rowGap=12, marginX=56, fullInner=W-112;
      var scorePanelW=showHealth ? Math.floor(fullInner*0.62) : Math.min(700, fullInner);
      var scorePanelX=showHealth ? marginX : Math.floor((W-scorePanelW)/2);
      var scoreInnerX=scorePanelX+scorePadX;
      var scoreNameX=scoreInnerX+8;
      var nameColMax=showHealth ? Math.floor(scorePanelW*0.42) : Math.floor(scorePanelW*0.48);
      function rosterHeight(roster, teamElo){
        var h=8;
        (roster||[]).forEach(function(r){ h+=30; if(r&&r.elo) h+=20; if(r&&r.rank) h+=20; });
        if(!(roster&&roster.length) && teamElo) h+=20;
        return Math.max(64, h);
      }
      var rowH=rosterHeight(leftRoster, leftElo);
      var rowH2=rosterHeight(rightRoster, rightElo);
      var scoreHdrH=32;
      var panelH=scoreHdrH+rowH+6+rowH2+scorePadBottom;
      var healthW=showHealth ? (fullInner-scorePanelW-rowGap) : 0;
      var healthX=showHealth ? (scorePanelX+scorePanelW+rowGap) : 0;
      var hPad=10;
      var hTileCount=showHealth?healthTiles.length:0;
      var hHeader=showHealth?(26+(healthSrc?14:0)):0;
      var hTileH=showHealth?Math.max(36, Math.floor((panelH-hPad*2-hHeader-Math.max(0,hTileCount-1)*6)/Math.max(1,hTileCount))):0;
      var hBoxH=showHealth?Math.max(panelH, hPad*2+hHeader+hTileCount*hTileH+Math.max(0,hTileCount-1)*6):0;
      var rowHReal=Math.max(panelH, hBoxH);
      var rowTop=ny;

      panel(scorePanelX, rowTop, scorePanelW, panelH);
      text(${JSON.stringify(p.colPlayer||'PLAYER')}, scoreNameX, rowTop+24, 16, '#78716C', 'left', '800');
      var setXs=[];
      var showSets=!isUpcoming && pairs.length>0;
      var setsEndX=scorePanelX+scorePanelW-scorePadX-28;
      var setCount=Math.max(pairs.length,1);
      var setSpan=Math.max(48, Math.min(72, Math.floor((scorePanelW-nameColMax-70)/setCount)));
      var setStartX=setsEndX-28-setCount*setSpan;
      if(showSets){
        for(var s=0;s<setCount;s++){
          var sx=setStartX+s*setSpan;
          setXs.push(sx);
          text('S'+(s+1), sx, rowTop+24, 15, '#78716C', 'center', '800');
        }
        text(${JSON.stringify(p.colSets||'SETS')}, setsEndX, rowTop+24, 15, '#78716C', 'center', '800');
      } else if(isUpcoming){
        text('VS', scorePanelX+scorePanelW*0.72, rowTop+24, 18, '#78716C', 'center', '800');
      }

      function drawPlayerRow(y, roster, teamElo, scores, setsWon, highlight, h){
        if(highlight){
          roundRect(scoreInnerX, y-24, scorePanelW-scorePadX*2, h, 10);
          ctx.fillStyle='rgba(200,245,74,0.12)'; ctx.fill();
        }
        var ty=y;
        var nameFs=showHealth?22:26;
        (roster||[]).forEach(function(r){
          var nm=nameLines((r&&r.name)||'', nameColMax, nameFs);
          nm.forEach(function(ln){ text(ln, scoreNameX, ty, nameFs, '#F4F1EA', 'left', '900'); ty+=nameFs+4; });
          if(r&&r.rank){ text('#'+String(r.rank), scoreNameX, ty+1, 16, '#FACC15', 'left', '900'); ty+=18; }
          if(r&&r.elo){ text(r.elo, scoreNameX, ty+1, 16, '#C8F54A', 'left', '800'); ty+=18; }
        });
        if((!roster||!roster.length) && teamElo) text(teamElo, scoreNameX, ty+1, 18, '#C8F54A', 'left', '800');
        var midY=y+Math.min(12, (h/2)-6);
        if(showSets){
          for(var i=0;i<scores.length;i++){
            text(String(scores[i]), setXs[i]||(setStartX+i*setSpan), midY, showHealth?26:30, '#F4F1EA', 'center', '900');
          }
          text(String(setsWon), setsEndX, midY, showHealth?26:30, '#C8F54A', 'center', '900');
        }
      }

      var L=pairs.map(function(pr){return pr[0];});
      var R=pairs.map(function(pr){return pr[1];});
      var y1=rowTop+scoreHdrH+22;
      drawPlayerRow(y1, leftRoster, leftElo, L, ${JSON.stringify(p.leftSets)}, ${p.winnerSide==='left'}, rowH);
      var y2=y1+rowH+6;
      drawPlayerRow(y2, rightRoster, rightElo, R, ${JSON.stringify(p.rightSets)}, ${p.winnerSide==='right'}, rowH2);

      if(showHealth){
        panel(healthX, rowTop, healthW, rowHReal);
        text(healthTitle, healthX+healthW/2, rowTop+hPad+16, 16, '#FB7185', 'center', '900');
        if(healthSrc) text(healthSrc, healthX+healthW/2, rowTop+hPad+30, 11, '#A8A29A', 'center', '700');
        var hTop=rowTop+hPad+hHeader+4;
        healthTiles.forEach(function(tile,i){
          var ty=hTop+i*(hTileH+6);
          roundRect(healthX+hPad, ty, healthW-hPad*2, hTileH, 10);
          ctx.fillStyle='rgba(251,113,133,0.10)'; ctx.fill();
          ctx.strokeStyle='rgba(251,113,133,0.35)'; ctx.lineWidth=1.2; ctx.stroke();
          text(tile.value||'', healthX+healthW/2, ty+Math.round(hTileH*0.42), Math.min(20, Math.max(14, Math.floor(hTileH*0.38))), '#F4F1EA', 'center', '900');
          text(tile.label||'', healthX+healthW/2, ty+hTileH-8, 11, '#A8A29A', 'center', '700');
        });
      }

      ny = rowTop + rowHReal + 12;

      // Turnuva skor paylaşımı: skor tablosu altında küçültülmüş puan tablosu
      var standingsTable=${JSON.stringify(p.standingsTable || null)};
      var hasStandings=!!(standingsTable && standingsTable.rows && standingsTable.rows.length);
      if(hasStandings){
        var stRowCount=Math.min(standingsTable.rows.length, 10);
        var stRowH=stRowCount>8?22:24;
        var stTitleH=28;
        var stHdrH=22;
        var stBoxH=18 + stTitleH + stHdrH + stRowCount*stRowH + 14;
        var stTop=ny;
        if(stTop + stBoxH > CTA_Y - 24){
          stBoxH=Math.max(80, CTA_Y - 24 - stTop);
          stRowCount=Math.max(3, Math.floor((stBoxH - 18 - stTitleH - stHdrH - 14)/stRowH));
          stBoxH=18 + stTitleH + stHdrH + stRowCount*stRowH + 14;
        }
        roundRect(56, stTop, W-112, stBoxH, 16);
        ctx.fillStyle='rgba(15,23,42,0.90)'; ctx.fill();
        ctx.strokeStyle='rgba(200,245,74,0.40)'; ctx.lineWidth=2; ctx.stroke();
        var hdr=standingsTable.headers||{};
        // Dar sütunlar — kartın altındaki kompakt tablo
        var colX=[72, 108, 560, 640, 720, 800, 880, 960];
        var sy=stTop+24;
        text(standingsTable.title||'', 540, sy, 20, '#C8F54A', 'center', '900');
        sy+=stTitleH-4;
        text('#', colX[0], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.player||'', colX[1]+4, sy, 16, '#94A3B8', 'left', '800');
        text(hdr.played||'P', colX[2], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.won||'W', colX[3], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.drawn||'D', colX[4], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.lost||'L', colX[5], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.avg||'Av', colX[6], sy, 16, '#94A3B8', 'center', '800');
        text(hdr.pts||'P', colX[7], sy, 16, '#4ade80', 'center', '800');
        sy+=8;
        ctx.strokeStyle='rgba(148,163,184,0.30)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(72, sy); ctx.lineTo(W-72, sy); ctx.stroke();
        sy+=stRowH-6;
        var nameMaxW=colX[2]-colX[1]-16;
        for(var ri=0; ri<stRowCount; ri++){
          var row=standingsTable.rows[ri];
          if(!row) continue;
          var rowFs=15;
          text(String(row.rank), colX[0], sy, rowFs, '#F4F1EA', 'center', '800');
          ctx.font='700 '+rowFs+'px sans-serif';
          var nm=String(row.name||'');
          while(nm.length>3 && ctx.measureText(nm).width>nameMaxW) nm=nm.slice(0,-1);
          if(nm!==String(row.name||'') && nm.length) nm=nm.slice(0,-1)+'…';
          text(nm, colX[1]+4, sy, rowFs, '#F4F1EA', 'left', '700');
          text(String(row.played), colX[2], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.won), colX[3], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.drawn), colX[4], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.lost), colX[5], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.avg), colX[6], sy, rowFs, '#E7E5E4', 'center', '700');
          text(String(row.points), colX[7], sy, rowFs, '#4ade80', 'center', '900');
          sy+=stRowH;
        }
        if(standingsTable.rows.length>stRowCount){
          text('… +'+(standingsTable.rows.length-stRowCount), 540, Math.min(sy-2, stTop+stBoxH-10), 14, '#94A3B8', 'center', '700');
        }
        ny = stTop + stBoxH + 14;
      }

      // Canlı takip istatistik panelleri — digimon / puan tablosu ile CTA arasında kalan alana sığdır
      var panels=${JSON.stringify((stats && stats.panels) || [])};
      var roomForStats = CTA_Y - 36 - ny;
      var maxPanels = panels.length > 4 ? 4 : panels.length;
      if(hasStandings) maxPanels = Math.min(maxPanels, 2);
      if(roomForStats < 140) maxPanels = 0;
      else if(roomForStats < 280) maxPanels = Math.min(maxPanels, 2);
      var colW = (W-112-20)/2;
      var px = 56, py = ny;
      var rowMaxH = 0;
      for(var pi=0; pi<maxPanels; pi++){
        var pn=panels[pi];
        var tiles=pn.tiles||[];
        var th = 48 + tiles.length*46 + 16;
        if(pi%2===0){ px=56; if(pi>0) py += rowMaxH + 16; rowMaxH=0; }
        else { px=56+colW+20; }
        if(py+th > CTA_Y-36) break;
        panel(px, py, colW, th);
        text(pn.title||'', px+20, py+36, 24, pn.accent||'#C8F54A', 'left', '900');
        var ty2=py+74;
        tiles.forEach(function(tile){
          text(tile.label||'', px+20, ty2, 20, '#A8A29A', 'left', '700');
          text(tile.value||'', px+colW-20, ty2, 28, '#F4F1EA', 'right', '900');
          ty2+=48;
        });
        rowMaxH=Math.max(rowMaxH, th);
      }
      if(maxPanels>0) ny = py + rowMaxH + 24;

      // Highlights — sadece sığarsa
      var highs=${JSON.stringify((stats && stats.highlights) || [])};
      if(highs.length && ny+50 < CTA_Y-36){
        var hx=56;
        highs.forEach(function(h){
          ctx.font='800 20px sans-serif';
          var tw=ctx.measureText(h).width+36;
          roundRect(hx, ny, tw, 40, 20);
          ctx.fillStyle='rgba(200,245,74,0.18)'; ctx.fill();
          ctx.strokeStyle='rgba(200,245,74,0.45)'; ctx.lineWidth=2; ctx.stroke();
          text(h, hx+tw/2, ny+27, 20, '#C8F54A', 'center', '800');
          hx+=tw+12;
        });
        ny+=56;
      }

      roundRect(180, CTA_Y, 720, 92, 46);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(${JSON.stringify(p.ctaLabel||'AcTiViTy · Download')}, 540, 1776, 30, '#0B0C10', 'center', '900');

      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
    }catch(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ERR:'+String(e&&e.message||e));
    }
  }

  function withAvatar(bgImg){
    var avData=${JSON.stringify(avatarDataUrl||'')};
    if(avData){
      var av=new Image();
      av.onload=function(){ go(bgImg, av); };
      av.onerror=function(){ go(bgImg, null); };
      av.src=avData;
    } else {
      go(bgImg, null);
    }
  }

  var bgData=${JSON.stringify(bgDataUrl||'')};
  if(bgData){
    var img=new Image();
    img.onload=function(){ withAvatar(img); };
    img.onerror=function(){ withAvatar(null); };
    img.src=bgData;
  } else {
    setTimeout(function(){ withAvatar(null); }, 60);
  }
})();
</script></body></html>`;
}

export default function MatchResultShareModal({
    visible,
    match,
    onClose,
    tournament = null,
    standings = null,
}) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang) || 'tr';
    const myUser = useSelector(s => s.auth?.user);
    const insets = useSafeAreaInsets();
    const [tournamentWins, setTournamentWins] = useState(0);
    const [ranks, setRanks] = useState({
        singles: { local: null, national: null, international: null },
        doubles: { local: null, national: null, international: null },
    });
    const [includeDigimon, setIncludeDigimon] = useState(false);
    const [includeHealth, setIncludeHealth] = useState(false);
    const [liveHealth, setLiveHealth] = useState(null); // { healthTiles, workoutSource, hasWorkout }
    const [avatarDataUrl, setAvatarDataUrl] = useState(null);
    const shareMatch = useMemo(() => {
        if (!match) return null;
        if (tournament) return tournamentMatchToShareMatch(tournament, match) || match;
        return match;
    }, [match, tournament]);
    const payload = useMemo(() => {
        if (!visible || !match) return null;
        const base = tournament
            ? buildTournamentMatchSharePayload(tournament, match, standings, t, lang)
            : buildMatchSharePayload(match, t, lang);
        if (!base) return null;
        const sub = shareMatch?.subCategory || match.subCategory || tournament?.subCategory;
        const sharerCard = buildSharerDigimonPayload(myUser, sub, tournamentWins, t, lang, ranks);
        const isTourn = !!base.isTournament;
        const isUpcoming = !!base.isUpcoming;
        const shareStats = {
            ...(base.shareStats || {}),
            ...(liveHealth?.hasWorkout ? liveHealth : {}),
            healthTiles: (liveHealth?.healthTiles?.length
                ? liveHealth.healthTiles
                : (base.shareStats?.healthTiles || [])),
            hasWorkout: !!(liveHealth?.hasWorkout || base.shareStats?.hasWorkout),
            workoutSource: liveHealth?.workoutSource || base.shareStats?.workoutSource || '',
        };
        return {
            ...base,
            shareStats,
            sharerCard,
            includeDigimon,
            includeHealth: includeHealth && !!shareStats.hasWorkout,
            healthTitle: t.shareMatchHealthTitle || t.statWorkout || 'HEALTH',
            ctaLabel: t.shareMatchStoreCta || 'AcTiViTy · Uygulamayı indir',
            wonWord: isUpcoming
                ? (t.shareTournMatchVsWord || 'VS')
                : (t.shareMatchWonWord || (lang === 'tr' ? 'KAZANDI' : lang === 'ru' ? 'ПОБЕДИЛ' : lang === 'de' ? 'GEWINNT' : 'WON')),
            resultBadge: isTourn
                ? (isUpcoming
                    ? (t.shareTournMatchUpcomingBadge
                        || (lang === 'tr' ? 'YAKLAŞAN MAÇ' : lang === 'ru' ? 'ПРЕДСТОЯЩИЙ' : lang === 'de' ? 'NÄCHSTES SPIEL' : 'UPCOMING'))
                    : (t.shareTournMatchResultBadge
                        || (lang === 'tr' ? 'TURNUVA SONUCU' : lang === 'ru' ? 'ТУРНИР' : lang === 'de' ? 'TURNIER' : 'TOURNAMENT')))
                : (t.shareMatchResultBadge || (lang === 'tr' ? 'MAÇ SONUCU' : lang === 'ru' ? 'РЕЗУЛЬТАТ' : lang === 'de' ? 'ERGEBNIS' : 'MATCH RESULT')),
            colPlayer: t.shareMatchColPlayer || (lang === 'tr' ? 'OYUNCU' : lang === 'ru' ? 'ИГРОК' : lang === 'de' ? 'SPIELER' : 'PLAYER'),
            colSets: t.shareMatchColSets || 'SETS',
        };
    }, [visible, match, tournament, standings, shareMatch, t, lang, myUser, tournamentWins, ranks, includeDigimon, includeHealth, liveHealth]);
    const [busy, setBusy] = useState(false);
    const [needCapture, setNeedCapture] = useState(false);
    const [captureHtml, setCaptureHtml] = useState(null);
    const [photoPreviewUri, setPhotoPreviewUri] = useState(null);
    const [captureKey, setCaptureKey] = useState(0);
    const pendingAction = useRef(null);
    const bgDataRef = useRef(null);
    const avatarDataRef = useRef(null);
    const payloadRef = useRef(null);
    const previewOpenRef = useRef(false);
    const { width: winW, height: winH } = useWindowDimensions();
    payloadRef.current = payload;
    previewOpenRef.current = !!photoPreviewUri;

    useEffect(() => {
        if (!visible) {
            setNeedCapture(false);
            setCaptureHtml(null);
            setBusy(false);
            pendingAction.current = null;
            bgDataRef.current = null;
            avatarDataRef.current = null;
            setAvatarDataUrl(null);
            setPhotoPreviewUri(null);
            setTournamentWins(0);
            setRanks({
                singles: { local: null, national: null, international: null },
                doubles: { local: null, national: null, international: null },
            });
            setIncludeDigimon(false);
            setIncludeHealth(false);
            setLiveHealth(null);
        }
    }, [visible]);

    // Maç için sağlık verisi: kayıtlı workout varsa onu kullan; yoksa saat/telefondan senkron dene
    useEffect(() => {
        if (!visible || !shareMatch) {
            setLiveHealth(null);
            return undefined;
        }
        let cancelled = false;
        const existing = shareMatch?.score?.stats?.workout;
        if (existing && (existing.avgHeartRate != null || existing.activeCalories != null || existing.maxHeartRate != null)) {
            setLiveHealth(buildShareHealthFromWorkout(existing, shareMatch, t));
            return undefined;
        }
        (async () => {
            try {
                const { startAt, endAt } = rivalMatchTimeWindow(shareMatch);
                const res = await fetchMatchWorkoutStats({
                    startAt,
                    endAt,
                    sport: shareMatch.subCategory,
                    matchMode: shareMatch.matchType || shareMatch.matchMode,
                    gender: myUser?.gender,
                });
                if (cancelled) return;
                if (res?.workout) {
                    setLiveHealth(buildShareHealthFromWorkout(res.workout, shareMatch, t));
                } else {
                    setLiveHealth(null);
                }
            } catch {
                if (!cancelled) setLiveHealth(null);
            }
        })();
        return () => { cancelled = true; };
    }, [visible, shareMatch?.id, shareMatch?.score?.stats?.workout, myUser?.gender, t]);

    // Şampiyonluk + yerel/ulusal/uluslararası sıralama — UTR'de tekli ve çiftler ayrı
    useEffect(() => {
        const subCat = shareMatch?.subCategory || match?.subCategory || tournament?.subCategory;
        if (!visible || !myUser?.id || !subCat) {
            setTournamentWins(0);
            setRanks({
                singles: { local: null, national: null, international: null },
                doubles: { local: null, national: null, international: null },
            });
            return undefined;
        }
        let cancelled = false;
        const sub = subCat;
        const isUtr = UTR_SHARE_SUBS.has(sub);
        const scopes = ['local', 'national', 'international'];
        const fetchScope = (scope, ratingType) =>
            api.get('/interests/leaderboard', {
                params: { subCategory: sub, scope, ...(ratingType ? { ratingType } : {}) },
            }).catch(() => ({ data: null }));

        (async () => {
            try {
                const achP = api.get(`/achievements/${myUser.id}`).catch(() => ({ data: null }));
                const singlesPs = scopes.map((sc) => fetchScope(sc, isUtr ? 'singles' : undefined));
                const doublesPs = isUtr
                    ? scopes.map((sc) => fetchScope(sc, 'doubles'))
                    : [Promise.resolve({ data: null }), Promise.resolve({ data: null }), Promise.resolve({ data: null })];
                const [achRes, ...rest] = await Promise.all([achP, ...singlesPs, ...doublesPs]);
                if (cancelled) return;
                const list = Array.isArray(achRes?.data?.tournament) ? achRes.data.tournament : [];
                setTournamentWins(list.filter(
                    (a) => a?.subCategory === sub && Number(a?.placement) === 1,
                ).length);
                const sRes = rest.slice(0, 3);
                const dRes = rest.slice(3, 6);
                setRanks({
                    singles: {
                        local: sRes[0]?.data?.myRank ?? null,
                        national: sRes[1]?.data?.myRank ?? null,
                        international: sRes[2]?.data?.myRank ?? null,
                    },
                    doubles: {
                        local: dRes[0]?.data?.myRank ?? null,
                        national: dRes[1]?.data?.myRank ?? null,
                        international: dRes[2]?.data?.myRank ?? null,
                    },
                });
            } catch {
                if (!cancelled) {
                    setTournamentWins(0);
                    setRanks({
                        singles: { local: null, national: null, international: null },
                        doubles: { local: null, national: null, international: null },
                    });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [visible, myUser?.id, shareMatch?.subCategory, match?.subCategory, tournament?.subCategory]);

    // Zemin/spor arka planı + avatar önceden yükle
    useEffect(() => {
        if (!visible || !payload) {
            bgDataRef.current = null;
            avatarDataRef.current = null;
            return undefined;
        }
        let cancelled = false;
        (async () => {
            const [bg, av] = await Promise.all([
                shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw),
                avatarToDataUrl(payload.sharerCard?.avatarUrl),
            ]);
            if (cancelled) return;
            bgDataRef.current = bg;
            avatarDataRef.current = av;
            setAvatarDataUrl(av);
        })();
        return () => { cancelled = true; };
    }, [visible, payload?.id, payload?.subCategory, payload?.surfaceRaw, payload?.sharerCard?.avatarUrl]);

    const onPng = async (dataUrl) => {
        setNeedCapture(false);
        setCaptureHtml(null);
        if (!dataUrl || dataUrl.startsWith('ERR:')) {
            setBusy(false);
            Alert.alert(t.error, t.shareMatchFail);
            return;
        }
        const action = pendingAction.current;
        pendingAction.current = null;
        try {
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            // Cache bust — Digimon/sağlık toggle sonrası eski önizleme kalmasın
            const stamp = `${Date.now()}-${payload.includeDigimon ? 'd' : 'n'}-${payload.includeHealth ? 'h' : 'x'}`;
            const path = `${FileSystem.cacheDirectory}activity-match-${payload.id}-${stamp}.png`;
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            if (action === 'preview') {
                setPhotoPreviewUri(path);
                return;
            }
            const message = payload.isTournament
                ? tournamentMatchShareMessage(payload, t)
                : matchShareMessage(payload, t);

            if (action === 'save') {
                const ok = await ensureGallerySave(path);
                if (!ok) Alert.alert(t.error, t.shareMatchGalleryDenied);
                else Alert.alert('', t.shareMatchSaved);
                return;
            }
            if (action === 'whatsapp') {
                await shareToWhatsApp({ filePath: path, message });
                onClose?.();
                return;
            }
            if (action === 'wa_status') {
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToWhatsAppStatus({ filePath: path, message: '', t });
                return;
            }
            if (action === 'ig_story') {
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToInstagramStory({
                    filePath: path,
                    t,
                    linkUrl: payload.url || PLAY_STORE_URL,
                });
                return;
            }
            await shareViaSystemSheet({ filePath: path, message });
            onClose?.();
        } catch {
            Alert.alert(t.error, t.shareMatchFail);
        } finally {
            setBusy(false);
        }
    };

    const start = async (action) => {
        const p = payloadRef.current || payload;
        if (!p || busy) return;
        pendingAction.current = action;
        setBusy(true);
        try {
            if (!bgDataRef.current) {
                bgDataRef.current = await shareBackgroundToDataUrl(p.subCategory, p.surfaceRaw);
            }
            // Digimon açıldıysa avatarı her seferinde güncel tut
            if (p.includeDigimon && p.sharerCard?.avatarUrl) {
                if (!avatarDataRef.current) {
                    avatarDataRef.current = await avatarToDataUrl(p.sharerCard.avatarUrl);
                }
            }
            const html = cardHtml(p, bgDataRef.current, (p.includeDigimon ? (avatarDataRef.current || avatarDataUrl) : null));
            // WebView'ı zorla yeniden mount et — eski HTML/önizleme kalmasın
            setNeedCapture(false);
            setCaptureHtml(null);
            setCaptureKey((k) => k + 1);
            setTimeout(() => {
                setCaptureHtml(html);
                setNeedCapture(true);
            }, 30);
        } catch {
            setBusy(false);
            Alert.alert(t.error, t.shareMatchFail);
        }
    };

    // Digimon / sağlık toggle değişince açık önizlemeyi aşamalı yenile
    useEffect(() => {
        if (!visible || !previewOpenRef.current || !payload || busy) return undefined;
        const tmr = setTimeout(() => { start('preview'); }, 80);
        return () => clearTimeout(tmr);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includeDigimon, includeHealth]);

    const targets = [
        { id: 'preview', emoji: '👁', label: t.shareMatchPreviewBtn || 'Önizleme' },
        { id: 'whatsapp', emoji: '💬', label: 'WhatsApp' },
        { id: 'wa_status', emoji: '🟢', label: t.shareMatchWaStatus || 'WhatsApp Status' },
        { id: 'ig_story', emoji: '📱', label: t.shareMatchIgStory || 'Instagram Story' },
        { id: 'save', emoji: '📥', label: t.shareMatchSaveBtn || 'Save to gallery' },
        { id: 'more', emoji: '⋯', label: t.shareMatchMore || 'More apps' },
    ];

    if (!payload) {
        return (
            <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
                <View style={s.fullScreen} />
            </Modal>
        );
    }

    const previewImgH = Math.min(winH * 0.78, (winW - 32) * (H / W));

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[s.fullScreen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
                <View style={s.header}>
                    <Text style={s.title}>
                        {payload.isTournament
                            ? (payload.isUpcoming
                                ? (t.shareTournMatchTitleUpcoming || t.shareMatchTitle)
                                : (t.shareTournMatchTitle || t.shareMatchTitle))
                            : t.shareMatchTitle}
                    </Text>
                    <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={s.close}>✕</Text></TouchableOpacity>
                </View>

                <Text style={s.subHint}>
                    {payload.emoji} {payload.sport}
                    {payload.resultLabel ? ` · ${payload.resultLabel}` : ''}
                    {payload.wonWord && !payload.isUpcoming && payload.winnerSide !== 'draw' ? ` ${payload.wonWord}` : ''}
                </Text>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Digimon kartı isteğe bağlı — kapalıysa skor kartına çizilmez */}
                    {!!payload.sharerCard && (
                        <TouchableOpacity
                            style={[s.digimonToggle, includeDigimon && s.digimonToggleOn]}
                            activeOpacity={0.8}
                            onPress={() => setIncludeDigimon((v) => !v)}
                            disabled={busy}
                        >
                            <View style={[s.digimonCheckBox, includeDigimon && s.digimonCheckBoxOn]}>
                                {includeDigimon ? <Text style={s.digimonCheckMark}>✓</Text> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.digimonToggleTitle}>
                                    {t.shareMatchDigimonToggle || 'Digimon kartımı da ekle'}
                                </Text>
                                <Text style={s.digimonToggleHint}>
                                    {t.shareMatchDigimonToggleHint || 'ELO, maç/G/M ve sıralama önlü-arka kartta görünür'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    {/* Sağlık verileri — senkron/tahmin varsa; skor tabelesinin altına çizilir */}
                    {!!payload.shareStats?.hasWorkout && (
                        <TouchableOpacity
                            style={[s.digimonToggle, includeHealth && s.healthToggleOn]}
                            activeOpacity={0.8}
                            onPress={() => setIncludeHealth((v) => !v)}
                            disabled={busy}
                        >
                            <View style={[s.digimonCheckBox, includeHealth && s.healthCheckBoxOn]}>
                                {includeHealth ? <Text style={s.digimonCheckMark}>✓</Text> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.digimonToggleTitle}>
                                    {t.shareMatchHealthToggle || 'Sağlık verilerini de ekle'}
                                </Text>
                                <Text style={s.digimonToggleHint}>
                                    {t.shareMatchHealthToggleHint
                                        || 'Kalori, nabız ve süre skor tabelasının altında görünür'}
                                    {payload.shareStats?.workoutSource
                                        ? ` · ${payload.shareStats.workoutSource}`
                                        : ''}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    {busy ? (
                        <ActivityIndicator color="#C8F54A" style={{ marginVertical: 28 }} />
                    ) : (
                        targets.map((it) => (
                            <TouchableOpacity
                                key={it.id}
                                style={[s.row, it.id === 'preview' && s.previewRow]}
                                activeOpacity={0.75}
                                onPress={() => start(it.id)}
                            >
                                <Text style={s.emoji}>{it.emoji}</Text>
                                <Text style={s.rowLabel}>{it.label}</Text>
                                <Text style={s.chev}>›</Text>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            </View>

            {/* Foto önizleme — sadece Önizleme'ye basınca */}
            <Modal visible={!!photoPreviewUri} transparent animationType="fade" onRequestClose={() => setPhotoPreviewUri(null)}>
                <View style={s.previewOverlay}>
                    <TouchableOpacity style={s.previewClose} onPress={() => setPhotoPreviewUri(null)} hitSlop={12}>
                        <Text style={s.close}>✕</Text>
                    </TouchableOpacity>
                    {photoPreviewUri ? (
                        <Image
                            key={photoPreviewUri}
                            source={{ uri: photoPreviewUri }}
                            style={{ width: winW - 32, height: previewImgH, borderRadius: 12 }}
                            resizeMode="contain"
                        />
                    ) : null}
                </View>
            </Modal>

            {needCapture && captureHtml && (
                <View style={s.hidden} pointerEvents="none">
                    <WebView
                        key={`cap-${captureKey}`}
                        originWhitelist={['*']}
                        source={{ html: captureHtml }}
                        onMessage={(e) => onPng(e.nativeEvent?.data)}
                        javaScriptEnabled
                        style={{ width: 1, height: 1, opacity: 0 }}
                    />
                </View>
            )}
        </Modal>
    );
}

const s = StyleSheet.create({
    fullScreen: {
        flex: 1, backgroundColor: colors.bg || '#0B0C10',
        paddingHorizontal: 16,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    title: { color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 },
    close: { color: colors.textMuted, fontSize: 22 },
    subHint: {
        color: '#A8A29A', fontSize: 13, fontWeight: '700', marginBottom: 14,
    },
    digimonToggle: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#16181F', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
        marginBottom: 12, borderWidth: 1, borderColor: '#2A2D36',
    },
    digimonToggleOn: { borderColor: '#C8F54A66', backgroundColor: '#C8F54A12' },
    healthToggleOn: { borderColor: '#FB718566', backgroundColor: '#FB718512' },
    healthCheckBoxOn: { borderColor: '#FB7185', backgroundColor: '#FB7185' },
    digimonCheckBox: {
        width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#78716C',
        alignItems: 'center', justifyContent: 'center',
    },
    digimonCheckBoxOn: { borderColor: '#C8F54A', backgroundColor: '#C8F54A' },
    digimonCheckMark: { color: '#0B0C10', fontSize: 14, fontWeight: '900', lineHeight: 16 },
    digimonToggleTitle: { color: '#F4F1EA', fontSize: 14, fontWeight: '800' },
    digimonToggleHint: { color: '#A8A29A', fontSize: 11, fontWeight: '600', marginTop: 2 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface2 || '#222',
        borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14,
        marginBottom: 8, borderWidth: 1, borderColor: colors.border || '#333',
    },
    previewRow: { borderColor: '#C8F54A55', backgroundColor: '#C8F54A12' },
    emoji: { fontSize: 22, width: 28, textAlign: 'center' },
    rowLabel: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
    chev: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
    previewOverlay: {
        flex: 1, backgroundColor: '#000000ee',
        alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    previewClose: {
        position: 'absolute', top: 48, right: 20, zIndex: 2,
        width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    },
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -20, top: -20 },
});
