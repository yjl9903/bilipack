/** The wait screen is a native submission phase, never proof of upload/publication. */
export function isSubmissionWaiting(
  visibleText: string,
  editing: boolean,
  count: number,
  editorVisible = false
) {
  const compact = visibleText.replace(/\s+/g, '');
  return (
    !editing &&
    count === 1 &&
    !editorVisible &&
    compact.includes('等待视频上传完后会自动提交') &&
    compact.includes('取消自动提交')
  );
}

export function acceptsSubmissionCaption(
  waiting: boolean,
  samePage: boolean,
  sameTask: boolean,
  caption: string,
  previousCaption: string,
  editorTitle: string,
  sameVideo = false
) {
  return (
    samePage &&
    (sameTask || (waiting && sameVideo)) &&
    ((waiting && caption === previousCaption) || (!!editorTitle && caption === editorTitle))
  );
}
