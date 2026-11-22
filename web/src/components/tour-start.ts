/** 사용법 투어를 다시 열 때 쓰는 브라우저 사건. Tour가 듣고, 시작 안내가 보낸다. */
export const TOUR_START_EVENT = "booktelier:start-tour";
/** 투어가 열리거나 닫힐 때. 개발용 막대·히어로 넘김이 레이아웃을 밀지 않게 듣는다. */
export const TOUR_ACTIVITY_EVENT = "booktelier:tour-activity";

export function requestTour() {
  window.dispatchEvent(new Event(TOUR_START_EVENT));
}

export function setTourActive(active: boolean) {
  if (active) document.documentElement.dataset.btTour = "1";
  else delete document.documentElement.dataset.btTour;
  window.dispatchEvent(new Event(TOUR_ACTIVITY_EVENT));
}

export function isTourActive() {
  return document.documentElement.dataset.btTour === "1";
}
