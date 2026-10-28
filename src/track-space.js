import { Vector3, MathUtils } from '../vendor/three.module.js';

const UP = new Vector3(0, 1, 0);

// 출발선 뒤와 여러 바퀴 뒤에서도 같은 트랙 좌표를 돌려준다.
function trackParameter(length, distance, isClosed = true) {
  if (!Number.isFinite(length) || length <= 0) throw new RangeError('트랙 길이는 양수여야 합니다.');
  const validDistance = Number.isFinite(distance) ? distance : 0;
  if (!isClosed) return MathUtils.clamp(validDistance / length,0,1);
  const t = ((validDistance % length) + length) % length / length;
  // 부동소수점 나머지가 결승선을 1 직전으로 보내는 경우 접선까지 0과 일치시킨다.
  return t < 1e-12 || t > 1 - 1e-12 ? 0 : t;
}

/** 진행 방향을 바라보는 추적 카메라에서 오른쪽을 양수로 정의한다. */
export function trackFrame(curve, length, distance, lateral = 0) {
  const t = trackParameter(length, distance, curve.isClosed !== false);
  const p = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();
  // 출발 대기열과 결승 뒤 카메라는 곡선 끝의 접선을 따라 이어진다.
  // 열린 코스 끝에서 모든 선수가 한 점으로 뭉치거나 카메라가 내려다보지 않는다.
  if (curve.isClosed === false) {
    if (distance < 0) p.addScaledVector(tangent,distance);
    else if (distance > length) p.addScaledVector(tangent,distance-length);
  }
  const right = new Vector3().crossVectors(tangent, UP).normalize();
  p.addScaledVector(right, Number.isFinite(lateral) ? lateral : 0);
  return { p, tangent, right, t };
}

/** 양수는 화면 기준 우회전, 음수는 좌회전이다. */
export function trackCurvature(curve, length, distance) {
  const a = horizontalTangent(curve, length, distance - 7);
  const b = horizontalTangent(curve, length, distance + 7);
  return MathUtils.clamp((a.x * b.z - a.z * b.x) * 8, -1, 1);
}

/** 길이 1m당 실제 회전각. 우측 회전을 양수로 반환한다. */
export function trackTurnRate(curve, length, distance) {
  const a=horizontalTangent(curve,length,distance-1);
  const b=horizontalTangent(curve,length,distance+1);
  return Math.atan2(a.x*b.z-a.z*b.x,a.dot(b))/2;
}

// 오르내리는 각도와 수평 조향각을 분리해 언덕에서 좌우 곡률이 약해지지 않게 한다.
function horizontalTangent(curve,length,distance) {
  const tangent=curve.getTangentAt(trackParameter(length,distance,curve.isClosed !== false));
  tangent.y=0;
  return tangent.normalize();
}
