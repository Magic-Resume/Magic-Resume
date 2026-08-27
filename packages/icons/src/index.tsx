import { forwardRef } from 'react';
import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  Alert02Icon,
  AlertCircleIcon,
  AlignLeftIcon,
  AlignRightIcon,
  Analytics01Icon,
  AiGenerativeIcon as HugeAiGenerateIcon,
  ArrowDown01Icon,
  ArrowDownLeft01Icon,
  ArrowDownRight01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  ArrowUpDownIcon,
  ArrowUpLeft01Icon,
  ArrowUpRight01Icon,
  Award01Icon,
  Award03Icon,
  Bookmark01Icon,
  BotIcon,
  Briefcase01Icon,
  Bug01Icon,
  Building02Icon,
  BulbIcon,
  CallIcon,
  CanvasIcon,
  Cancel01Icon,
  CancelCircleIcon,
  Certificate01Icon,
  Chat01Icon,
  ChatBotIcon,
  ChatQuestionIcon,
  CheckListIcon,
  CheckmarkBadge01Icon,
  CheckmarkCircle01Icon,
  CircleIcon,
  ClipboardIcon,
  Clock01Icon,
  CloudIcon,
  CodeIcon,
  ComputerTerminal01Icon,
  ContactIcon,
  Copy01Icon,
  DashboardSpeed02Icon,
  Delete02Icon,
  Download01Icon,
  DragDropVerticalIcon,
  EyeIcon,
  FavouriteIcon,
  File01Icon,
  File02Icon,
  FileUploadIcon,
  Files01Icon,
  Flag01Icon,
  Folder01Icon,
  FolderOpenIcon,
  GiftIcon,
  GithubIcon,
  HelpCircleIcon,
  Home01Icon,
  Image01Icon,
  InformationCircleIcon,
  Key01Icon,
  LanguageSquareIcon,
  Layout01Icon,
  Layout2RowIcon,
  LayoutGridIcon,
  Link01Icon,
  Link02Icon,
  ListViewIcon,
  Loading02Icon,
  LockIcon,
  Logout01Icon,
  MagicWand01Icon,
  Mail02Icon,
  MailReply01Icon,
  Location01Icon,
  Message01Icon,
  MicOff01Icon,
  Mic02Icon,
  Moon01Icon,
  Mortarboard01Icon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  Notification01Icon,
  Pen01Icon,
  PenTool01Icon,
  PencilEdit01Icon,
  PencilIcon,
  PaintBoardIcon,
  InternetIcon,
  PlugSocketIcon,
  PlusSignIcon,
  RefreshIcon,
  RedoIcon,
  RocketIcon,
  Route01Icon,
  Search01Icon,
  SearchAddIcon,
  SearchMinusIcon,
  SentIcon,
  Settings01Icon,
  ShapesIcon,
  Share01Icon,
  Shield01Icon,
  SparklesIcon,
  SquareIcon,
  StarIcon,
  Sun01Icon,
  Target01Icon,
  Telescope01Icon,
  TestTube01Icon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignLeftIcon,
  TextBoldIcon,
  TextFontIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  Tick01Icon,
  ToolsIcon,
  TranslateIcon,
  TypeCursorIcon,
  UndoIcon,
  Unlink01Icon,
  Upload01Icon,
  UserGroupIcon,
  UserIcon,
  ViewIcon,
  ViewOffIcon,
  Wrench01Icon,
  XVariableIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';

/** Props compatible with the subset of Lucide's SVG component API used by the UI. */
export type RoundedIconProps = SVGProps<SVGSVGElement> & {
  size?: string | number;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
};

/**
 * Kept as a type alias during the migration so dynamic menu/icon registries
 * can continue accepting a component, while every glyph renders from the
 * rounded Hugeicons set.
 */
export type LucideIcon = ForwardRefExoticComponent<
  RoundedIconProps & RefAttributes<SVGSVGElement>
>;

function roundedIcon(icon: IconSvgElement): LucideIcon {
  return forwardRef<SVGSVGElement, RoundedIconProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} {...props} />
  ));
}

/**
 * Shared source of truth for resume-rendering icons. The browser uses the
 * component wrappers below; react-pdf consumes these same raw SVG nodes.
 */
export const ResumeIconNodes = {
  award: Award01Icon,
  briefcase: Briefcase01Icon,
  certificate: Certificate01Icon,
  code: CodeIcon,
  file: File02Icon,
  folder: FolderOpenIcon,
  folderKanban: Folder01Icon,
  github: GithubIcon,
  globe: InternetIcon,
  graduation: Mortarboard01Icon,
  heart: FavouriteIcon,
  languages: LanguageSquareIcon,
  lightbulb: BulbIcon,
  location: Location01Icon,
  mail: Mail02Icon,
  phone: CallIcon,
  rocket: RocketIcon,
  sparkles: SparklesIcon,
  star: StarIcon,
  target: Target01Icon,
  trophy: Award03Icon,
  user: UserIcon,
  wrench: Wrench01Icon,
} satisfies Record<string, IconSvgElement>;

export const AlertCircle = roundedIcon(AlertCircleIcon);
export const AlertTriangle = roundedIcon(Alert02Icon);
export const AiGenerateIcon = roundedIcon(HugeAiGenerateIcon);
export const AlignCenter = roundedIcon(TextAlignCenterIcon);
export const AlignJustify = roundedIcon(TextAlignJustifyCenterIcon);
export const AlignLeft = roundedIcon(AlignLeftIcon);
export const AlignRight = roundedIcon(AlignRightIcon);
export const ArrowDownUp = roundedIcon(ArrowUpDownIcon);
export const ArrowLeft = roundedIcon(ArrowLeft01Icon);
export const ArrowRight = roundedIcon(ArrowRight01Icon);
export const ArrowUp = roundedIcon(ArrowUp01Icon);
/** The full arrow is reserved for primary submit actions; ArrowUp01 is a chevron. */
export const SendArrow = roundedIcon(ArrowUp02Icon);
export const ArrowUpRight = roundedIcon(ArrowUpRight01Icon);
export const Award = roundedIcon(Award01Icon);
export const BadgeCheck = roundedIcon(CheckmarkBadge01Icon);
export const BarChart3 = roundedIcon(Analytics01Icon);
export const Bell = roundedIcon(Notification01Icon);
export const Bold = roundedIcon(TextBoldIcon);
export const Bookmark = roundedIcon(Bookmark01Icon);
export const Bot = roundedIcon(BotIcon);
export const BotMessageSquare = roundedIcon(ChatBotIcon);
export const Briefcase = roundedIcon(Briefcase01Icon);
export const BriefcaseBusiness = roundedIcon(Briefcase01Icon);
export const Bug = roundedIcon(Bug01Icon);
export const Building2 = roundedIcon(Building02Icon);
export const Check = roundedIcon(Tick01Icon);
export const CheckCircle2 = roundedIcon(CheckmarkCircle01Icon);
export const CheckIcon = roundedIcon(Tick01Icon);
export const Certificate = roundedIcon(Certificate01Icon);
export const ChevronDown = roundedIcon(ArrowDown01Icon);
export const ChevronDownIcon = roundedIcon(ArrowDown01Icon);
export const ChevronLeft = roundedIcon(ArrowLeft01Icon);
export const ChevronRight = roundedIcon(ArrowRight01Icon);
export const ChevronUp = roundedIcon(ArrowUp01Icon);
export const ChevronUpIcon = roundedIcon(ArrowUp01Icon);
export const CircleDot = roundedIcon(CircleIcon);
export const ClipboardList = roundedIcon(ClipboardIcon);
export const Clock = roundedIcon(Clock01Icon);
export const Cloud = roundedIcon(CloudIcon);
export const Code = roundedIcon(CodeIcon);
export const Code2 = roundedIcon(CodeIcon);
export const Contact = roundedIcon(ContactIcon);
export const Copy = roundedIcon(Copy01Icon);
export const CornerDownLeft = roundedIcon(ArrowDownLeft01Icon);
export const CornerDownRight = roundedIcon(ArrowDownRight01Icon);
export const CornerUpLeft = roundedIcon(ArrowUpLeft01Icon);
export const Download = roundedIcon(Download01Icon);
export const ExternalLink = roundedIcon(ArrowUpRight01Icon);
export const Eye = roundedIcon(ViewIcon);
export const EyeOff = roundedIcon(ViewOffIcon);
export const FileJson = roundedIcon(File01Icon);
export const FileText = roundedIcon(File02Icon);
export const Files = roundedIcon(Files01Icon);
export const FlaskConical = roundedIcon(TestTube01Icon);
export const FolderKanban = roundedIcon(Folder01Icon);
export const FolderOpen = roundedIcon(FolderOpenIcon);
export const Canvas = roundedIcon(CanvasIcon);
export const Gauge = roundedIcon(DashboardSpeed02Icon);
export const Gift = roundedIcon(GiftIcon);
export const Github = roundedIcon(GithubIcon);
export const Globe = roundedIcon(InternetIcon);
export const GraduationCap = roundedIcon(Mortarboard01Icon);
export const GripVertical = roundedIcon(DragDropVerticalIcon);
export const Heading1 = roundedIcon(TextAlignLeftIcon);
export const Heading2 = roundedIcon(TextAlignCenterIcon);
export const Heading3 = roundedIcon(TextAlignJustifyCenterIcon);
export const Heart = roundedIcon(FavouriteIcon);
export const HelpCircle = roundedIcon(HelpCircleIcon);
export const History = roundedIcon(Clock01Icon);
export const Home = roundedIcon(Home01Icon);
export const Image = roundedIcon(Image01Icon);
export const Info = roundedIcon(InformationCircleIcon);
export const Italic = roundedIcon(TextItalicIcon);
export const KeyRound = roundedIcon(Key01Icon);
export const Languages = roundedIcon(LanguageSquareIcon);
export const Layout = roundedIcon(Layout01Icon);
export const LayoutDashboard = roundedIcon(LayoutGridIcon);
export const LayoutGrid = roundedIcon(LayoutGridIcon);
export const LayoutTemplate = roundedIcon(Layout2RowIcon);
export const LifeBuoy = roundedIcon(HelpCircleIcon);
export const Lightbulb = roundedIcon(BulbIcon);
export const Link = roundedIcon(Link01Icon);
export const Link2 = roundedIcon(Link02Icon);
export const List = roundedIcon(ListViewIcon);
export const ListChecks = roundedIcon(CheckListIcon);
export const ListOrdered = roundedIcon(ListViewIcon);
export const Loader2 = roundedIcon(Loading02Icon);
export const Lock = roundedIcon(LockIcon);
export const LogOut = roundedIcon(Logout01Icon);
export const Mail = roundedIcon(Mail02Icon);
export const MapPin = roundedIcon(Location01Icon);
export const MessageCircle = roundedIcon(Chat01Icon);
export const MessageCircleQuestion = roundedIcon(ChatQuestionIcon);
export const MessageSquare = roundedIcon(Message01Icon);
export const Mic = roundedIcon(Mic02Icon);
export const MicOff = roundedIcon(MicOff01Icon);
export const Milestone = roundedIcon(Flag01Icon);
export const Moon = roundedIcon(Moon01Icon);
export const MoreVertical = roundedIcon(MoreVerticalIcon);
export const Palette = roundedIcon(PaintBoardIcon);
export const PenLine = roundedIcon(Pen01Icon);
export const Pencil = roundedIcon(PencilEdit01Icon);
export const PencilRuler = roundedIcon(ToolsIcon);
export const Phone = roundedIcon(CallIcon);
export const PlugZap = roundedIcon(PlugSocketIcon);
export const Plus = roundedIcon(PlusSignIcon);
export const Redo2 = roundedIcon(RedoIcon);
export const RefreshCw = roundedIcon(RefreshIcon);
export const Reply = roundedIcon(MailReply01Icon);
export const Rocket = roundedIcon(RocketIcon);
export const RotateCcw = roundedIcon(RefreshIcon);
export const Route = roundedIcon(Route01Icon);
export const Search = roundedIcon(Search01Icon);
export const Send = roundedIcon(SentIcon);
export const Settings = roundedIcon(Settings01Icon);
export const Shapes = roundedIcon(ShapesIcon);
export const Share2 = roundedIcon(Share01Icon);
export const Shield = roundedIcon(Shield01Icon);
export const ShieldAlert = roundedIcon(Alert02Icon);
export const ShieldCheck = roundedIcon(Shield01Icon);
export const Sparkles = roundedIcon(SparklesIcon);
export const Square = roundedIcon(SquareIcon);
export const SquarePen = roundedIcon(PencilEdit01Icon);
export const Star = roundedIcon(StarIcon);
export const Strikethrough = roundedIcon(TextStrikethroughIcon);
export const Sun = roundedIcon(Sun01Icon);
export const Target = roundedIcon(Target01Icon);
export const Telescope = roundedIcon(Telescope01Icon);
export const Terminal = roundedIcon(ComputerTerminal01Icon);
export const TextFont = roundedIcon(TextFontIcon);
export const Trash2 = roundedIcon(Delete02Icon);
export const TriangleAlert = roundedIcon(Alert02Icon);
export const Trophy = roundedIcon(Award03Icon);
export const Translate = roundedIcon(TranslateIcon);
export const Type = roundedIcon(TypeCursorIcon);
export const Underline = roundedIcon(TextUnderlineIcon);
export const Undo2 = roundedIcon(UndoIcon);
export const Unlink = roundedIcon(Unlink01Icon);
export const Upload = roundedIcon(Upload01Icon);
export const User = roundedIcon(UserIcon);
export const Users = roundedIcon(UserGroupIcon);
export const Wand2 = roundedIcon(MagicWand01Icon);
export const Wrench = roundedIcon(Wrench01Icon);
export const X = roundedIcon(Cancel01Icon);
export const XCircle = roundedIcon(CancelCircleIcon);
export const Zap = roundedIcon(ZapIcon);
export const ZoomIn = roundedIcon(SearchAddIcon);
export const ZoomOut = roundedIcon(SearchMinusIcon);

// Compatibility aliases for the few remaining Radix and react-icons imports.
export const CopyIcon = Copy;
export const DotsHorizontalIcon = roundedIcon(MoreHorizontalIcon);
export const DownloadIcon = Download;
export const FaCopy = Copy;
export const FaFileUpload = roundedIcon(FileUploadIcon);
export const FaGripVertical = GripVertical;
export const FaPlus = Plus;
export const FiEdit = Pencil;
export const FiLayout = Layout;
export const GlobeIcon = Globe;
export const LockClosedIcon = Lock;
export const Pencil2Icon = Pencil;
export const TrashIcon = Trash2;
