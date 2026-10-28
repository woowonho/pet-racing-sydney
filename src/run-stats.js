// 실제 코스의 네 구간 통과 기록과 주행 성과를 경기 이벤트로 집계한다.
export class RunStats {
  constructor(length, previousSplits = []) {
    this.length = length;
    // 출발 뒤 최고 기록이 갱신돼도 이번 경기의 비교 기준은 바뀌지 않는다.
    this.previousSplits = Array.isArray(previousSplits) ? previousSplits.map(split => ({...split})) : [];
    this.markers = [.25, .5, .75, 1].map(progress => length * progress);
    this.splits = [];
    this.cleanDrifts = 0;
    this.boosts = 0;
    this.overtakes = 0;
    this.landings = 0;
    this.wallHits = 0;
    this.topSpeed = 0;
    this._previous = null;
  }

  event(event) {
    if (event.racerId !== 'player') return;
    if (event.type === 'drift-release' && event.clean !== false && !event.crashed && event.quality >= .55) this.cleanDrifts++;
    if (event.type === 'boost') this.boosts++;
    if (event.type === 'land' && event.clean) this.landings++;
    if (event.type === 'wall') this.wallHits++;
  }

  sample(time, player) {
    const distance = Math.max(0, Math.min(this.length, player.distance));
    const previous = this._previous || {time:0, distance:0, position:player.position};
    this.topSpeed = Math.max(this.topSpeed, player.speed * 3.6);
    if (player.position < previous.position) this.overtakes += previous.position - player.position;
    const crossed = [];
    while (this.splits.length < this.markers.length && distance >= this.markers[this.splits.length]) {
      const marker = this.markers[this.splits.length];
      const ratio = distance > previous.distance ? (marker - previous.distance) / (distance - previous.distance) : 1;
      const elapsed = previous.time + (time - previous.time) * Math.max(0, Math.min(1, ratio));
      const best = this.previousSplits.find(split => Math.abs(split.distance - marker) < 1);
      const sector = this.splits.length + 1;
      const split = {distance:marker, progress:sector / this.markers.length, sector,
        time:elapsed, delta:Number.isFinite(best?.time) ? elapsed-best.time : null};
      this.splits.push(split);
      crossed.push(split);
    }
    this._previous = {time, distance, position:player.position};
    return crossed;
  }

  summary() {
    return {cleanDrifts:this.cleanDrifts, boosts:this.boosts, overtakes:this.overtakes,
      cleanLandings:this.landings, wallHits:this.wallHits, topSpeed:Math.round(this.topSpeed)};
  }
}
