/**
 * Sistema de iconos centralizado usando lucide-svelte.
 *
 * Importar desde '$lib/components/icons' o '$lib/components'.
 * Ver docs/ICONS.md para guía de uso.
 */
export {
  // Navegación
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,

  // Estado/Indicadores
  Check,
  X,
  AlertTriangle,
  Minus,
  Info,

  // Archivos
  FileText,
  FileSpreadsheet,
  Image,
  Folder,
  File,

  // Acciones
  Search,
  Save,
  Trash2,
  Download,
  Upload,
  Plus,
  Eye,
  Edit,
  RotateCw,
  RefreshCw,

  // Estados de resultado
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,

  // UI/Navegación
  Home,
  Users,
  User,
  Building2,
  Menu,
  ClipboardList,
  FileEdit,
  Cloud,
  Package,
  Inbox,
} from 'lucide-svelte';

/**
 * Tamaños estándar de iconos.
 * xs: badges, indicadores inline
 * sm: botones pequeños, listas
 * md: botones, navegación
 * lg: headers, acciones principales
 */
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export type IconSize = keyof typeof ICON_SIZES;
