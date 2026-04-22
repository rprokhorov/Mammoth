import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageItem } from "@/components/message/MessageItem";
import { useUiStore } from "@/stores/uiStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useThreadsStore } from "@/stores/threadsStore";

vi.mock("@/components/message/CustomEmojiRenderer", () => ({
  CustomEmojiRenderer: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock("@/components/message/ReactionsBar", () => ({
  ReactionsBar: () => <div data-testid="reactions-bar" />,
}));
vi.mock("@/components/message/MessageAttachments", () => ({
  MessageAttachments: () => <div />,
}));
vi.mock("@/components/message/FileAttachment", () => ({
  FileAttachment: () => <div />,
}));
vi.mock("@/components/common/UserAvatar", () => ({
  UserAvatar: () => <div />,
}));
vi.mock("@/components/message/PresenceDot", () => ({
  PresenceDot: () => <span />,
}));
vi.mock("@/components/user/UserPopover", () => ({
  UserPopover: () => <div />,
}));

// EmojiPicker renders a div we can inspect via data-testid
vi.mock("@/components/message/EmojiPicker", () => ({
  EmojiPicker: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="emoji-picker">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

function makePost(overrides: Partial<PostData> = {}): PostData {
  return {
    id: "p1",
    channel_id: "ch1",
    user_id: "user1",
    root_id: "",
    message: "Hello",
    post_type: "",
    create_at: 1000,
    update_at: 1000,
    delete_at: 0,
    edit_at: 0,
    reply_count: 0,
    is_pinned: false,
    file_ids: [],
    props: {},
    ...overrides,
  };
}

const defaultProps = {
  showAvatar: true,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  currentUserId: "user1",
  serverId: "srv1",
};

function setup() {
  useUiStore.setState({
    users: { user1: { id: "user1", username: "alice", first_name: "Alice", last_name: "", nickname: "", email: "" } },
    activeTeamId: "team1",
    activeServerId: "srv1",
  });
  useMessagesStore.setState({ posts: {}, orderByChannel: {}, loading: false, editingPostId: null, scrollToPostId: null });
  useThreadsStore.setState({ activeThreadId: null, threadOrder: {}, threadPosts: {}, threadParticipants: {}, userThreads: [], userThreadsTotal: 0, userThreadsUnread: 0, threadLoading: false, scrollToThreadPostId: null });
}

// Helper: mock button getBoundingClientRect + window dimensions, click the button,
// and return the wrapper div style of the emoji picker.
function openPickerWithRect(
  btnRect: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
) {
  const post = makePost();
  render(<MessageItem {...defaultProps} post={post} />);

  const btn = screen.getByTitle("Add reaction");
  vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
    ...btnRect,
    width: btnRect.right - btnRect.left,
    height: btnRect.bottom - btnRect.top,
    x: btnRect.left,
    y: btnRect.top,
    toJSON: () => ({}),
  } as DOMRect);

  vi.stubGlobal("innerWidth", viewport.width);
  vi.stubGlobal("innerHeight", viewport.height);

  fireEvent.click(btn);

  const picker = screen.getByTestId("emoji-picker");
  // the wrapper div is the direct parent
  return picker.parentElement!;
}

describe("EmojiPicker positioning", () => {
  beforeEach(setup);
  afterEach(() => vi.unstubAllGlobals());

  // ── Toggle ──────────────────────────────────────────────────────────────────

  it("opens picker on first click", () => {
    const post = makePost();
    render(<MessageItem {...defaultProps} post={post} />);
    expect(screen.queryByTestId("emoji-picker")).toBeNull();
    fireEvent.click(screen.getByTitle("Add reaction"));
    expect(screen.queryByTestId("emoji-picker")).not.toBeNull();
  });

  it("closes picker on second click (toggle)", () => {
    const post = makePost();
    render(<MessageItem {...defaultProps} post={post} />);
    const btn = screen.getByTitle("Add reaction");
    fireEvent.click(btn);
    expect(screen.queryByTestId("emoji-picker")).not.toBeNull();
    fireEvent.click(btn);
    expect(screen.queryByTestId("emoji-picker")).toBeNull();
  });

  it("closes picker when EmojiPicker calls onClose", () => {
    const post = makePost();
    render(<MessageItem {...defaultProps} post={post} />);
    fireEvent.click(screen.getByTitle("Add reaction"));
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByTestId("emoji-picker")).toBeNull();
  });

  // ── position: fixed ─────────────────────────────────────────────────────────

  it("uses position:fixed", () => {
    const wrapper = openPickerWithRect(
      { top: 400, bottom: 420, left: 900, right: 950 },
      { width: 1200, height: 800 },
    );
    expect(wrapper.style.position).toBe("fixed");
  });

  // ── Opens below when there is enough space below ────────────────────────────

  it("opens below button when picker fits below", () => {
    // btn bottom=200, pickerHeight=250, gap=4 → needs 200+4+250=454 <= 800-8=792 ✓
    const wrapper = openPickerWithRect(
      { top: 180, bottom: 200, left: 900, right: 950 },
      { width: 1200, height: 800 },
    );
    const top = parseFloat(wrapper.style.top);
    // top should be rect.bottom + gapBelow = 200 + 4 = 204
    expect(top).toBeCloseTo(204, 0);
  });

  // ── Opens above when there is not enough space below ────────────────────────

  it("opens above button when picker does not fit below", () => {
    // btn bottom=600, pickerHeight=250, gap=4 → needs 600+4+250=854 > 800-8=792 → above
    // visibleTop = 600 - 20 (toolbarOffset=8, btn height=20) ≈ rect.top - 8 = 580 - 8 = 572
    // top = 572 - 250 - 4 = 318
    const wrapper = openPickerWithRect(
      { top: 580, bottom: 600, left: 900, right: 950 },
      { width: 1200, height: 800 },
    );
    const top = parseFloat(wrapper.style.top);
    // picker bottom = top + 250 should be <= btn visible top (580 - 8 = 572)
    expect(top + 250).toBeLessThanOrEqual(572 + 1); // +1 for rounding
  });

  it("picker bottom does not overlap button top when opening above", () => {
    // btn bottom=600, vh=700 → 600+4+250=854 > 700-8=692 → opens above
    const btnTop = 580;
    const wrapper = openPickerWithRect(
      { top: btnTop, bottom: 600, left: 900, right: 950 },
      { width: 1200, height: 700 },
    );
    const top = parseFloat(wrapper.style.top);
    const pickerBottom = top + 250;
    // picker must not overlap the visible toolbar (rect.top - toolbarOffset)
    const visibleToolbarTop = btnTop - 8;
    expect(pickerBottom).toBeLessThanOrEqual(visibleToolbarTop);
  });

  // ── Horizontal alignment ─────────────────────────────────────────────────────

  it("right-aligns picker with button right edge", () => {
    const wrapper = openPickerWithRect(
      { top: 100, bottom: 120, left: 900, right: 960 },
      { width: 1200, height: 800 },
    );
    const left = parseFloat(wrapper.style.left);
    // left = rect.right - pickerWidth = 960 - 320 = 640
    expect(left).toBeCloseTo(640, 0);
  });

  it("clamps left so picker does not overflow right edge of viewport", () => {
    // btn right=1190, vw=1200 → unclamped left=1190-320=870, clamped=min(870, 1200-320-8)=min(870,872)=870 ✓
    // btn right=1210 (near edge) → unclamped left=1210-320=890, clamped=min(890, 872)=872
    const wrapper = openPickerWithRect(
      { top: 100, bottom: 120, left: 1100, right: 1210 },
      { width: 1200, height: 800 },
    );
    const left = parseFloat(wrapper.style.left);
    expect(left).toBeLessThanOrEqual(1200 - 320 - 8);
  });

  it("clamps left so picker does not overflow left edge of viewport", () => {
    // btn right=10 → unclamped left=10-320=-310 → clamped to 8
    const wrapper = openPickerWithRect(
      { top: 100, bottom: 120, left: 0, right: 10 },
      { width: 1200, height: 800 },
    );
    const left = parseFloat(wrapper.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  // ── Vertical clamping ────────────────────────────────────────────────────────

  it("clamps top so picker does not go above viewport", () => {
    // btn very near top: above case, top could be negative → clamped to 8
    const wrapper = openPickerWithRect(
      { top: 10, bottom: 30, left: 600, right: 650 },
      { width: 1200, height: 400 },
    );
    const top = parseFloat(wrapper.style.top);
    expect(top).toBeGreaterThanOrEqual(8);
  });

  it("clamps top so picker bottom does not go below viewport", () => {
    const vh = 400;
    const wrapper = openPickerWithRect(
      { top: 10, bottom: 30, left: 600, right: 650 },
      { width: 1200, height: vh },
    );
    const top = parseFloat(wrapper.style.top);
    expect(top + 250).toBeLessThanOrEqual(vh - 8 + 1); // +1 for rounding
  });
});
