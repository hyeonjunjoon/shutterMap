function toDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z';

// 기본: 검정 채움 + 흰 테두리(흑백 원칙, §5).
export const PIN_ICON_DEFAULT = toDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32"><path d="${PIN_PATH}" fill="black" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`,
);

// 선택: 값 반전(흰 채움 + 검정 테두리) + 확대(§5, hover/클릭 공용).
export const PIN_ICON_SELECTED = toDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 24 32"><path d="${PIN_PATH}" fill="white" stroke="black" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="black"/></svg>`,
);

export const PIN_SIZE_DEFAULT = { width: 24, height: 32 };
export const PIN_SIZE_SELECTED = { width: 32, height: 42 };
