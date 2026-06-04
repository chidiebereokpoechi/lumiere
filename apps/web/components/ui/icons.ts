// Central icon set — VS Code Codicons via react-icons, aliased to semantic names
// so the rest of the app imports from one place. Icons inherit `currentColor`;
// size with the `size` prop or a className.
//
// Harmonized size scale — keep icon sizes on these three steps for cohesion:
//   sm 16 — inline w/ text, meta, chips/badges, admin row actions, menu items,
//           selects, date-field, small nav chevrons.
//   md 20 — secondary standalone glyphs (spinner, in-tile play badge).
//   lg 24 — primary interactive chrome + main nav (lightbox/preview bars,
//           prev/next, selection bar, client grid overlays, sidebar nav).
// Decorative one-offs (drop-zone, audio artwork) may exceed the scale.
export const ICON = { sm: 16, md: 20, lg: 24 } as const;
export {
  VscChevronDown as ChevronDown,
  VscChevronUp as ChevronUp,
  VscChevronLeft as ChevronLeft,
  VscChevronRight as ChevronRight,
  VscLayoutSidebarLeft as Collapse,
  VscClose as Close,
  VscCheck as Check,
  VscAdd as Plus,
  VscTrash as Trash,
  VscEdit as Pen,
  VscEye as Eye,
  VscEyeClosed as EyeOff,
  VscGitFetch as Download,
  VscCopy as Copy,
  VscCloudUpload as Upload,
  VscFileMedia as ImageIcon,
  VscPlay as Play,
  VscKebabVertical as More,
  VscBookmark as Bookmark,
  VscFolder as Folder,
  VscCalendar as Calendar,
  VscLinkExternal as External,
  VscFileZip as Zip,
  VscMusic as Music,
  VscFile as FileDoc,
  VscArrowLeft as ArrowLeft,
  VscArrowRight as ArrowRight,
  VscDebugPause as Pause,
  VscTriangleLeft as SkipBack,
  VscTriangleRight as SkipForward,
  VscSortPrecedence as Sort,
  VscFilter as Filter,
  VscGraphLine as Chart,
  VscComment as Comment,
  VscShield as Watermark,
  VscLayout as Grid,
  VscGear as Gear,
  VscListUnordered as ListIcon,
  VscLoading as SpinnerIcon,
  VscRemove as Grip,
  VscHeart as HeartOpen,
  VscHeartFilled as Heart,
  VscMail as Mail,
  VscLink as LinkIcon,
} from "react-icons/vsc";
export { FaInstagram as Instagram } from "react-icons/fa";
