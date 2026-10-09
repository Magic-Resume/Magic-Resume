import metaConfig from "@/lib/constants/metaConfig";
import { Metadata } from "next";

export const metadata: Metadata = metaConfig.Edit;

export default function EditLayout({ children }: { children: React.ReactNode }) {
    return (
        // 翻译插件改写编辑区 DOM 后 React 协调会抛 removeChild / insertBefore，整块编辑器挂掉。
        <div translate="no" className="flex h-screen bg-desk text-white overflow-hidden">
            {children}
        </div>
    );
}