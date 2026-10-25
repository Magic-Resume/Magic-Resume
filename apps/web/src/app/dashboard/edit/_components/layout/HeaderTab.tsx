import { ChevronLeft } from '@magic-resume-kit/icons';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ResumeSwitcher from './ResumeSwitcher';

import { EASE_ENTER } from '@magic-resume-kit/utils';

/**
 * 工作台顶栏 —— 不做盒子,做"舞台的边"。一层从画布顶部淡出的 scrim 托起标题,
 * 让 chrome 退入背景(设计原则:画布是舞台、能力按需浮现)。
 */
export default function HeaderTab() {
    const { t } = useTranslation();

    return (
        <motion.header
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: EASE_ENTER }}
            className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-16 min-w-0 items-center gap-4 overflow-visible bg-gradient-to-b from-desk via-desk/70 to-transparent px-6"
        >
            {/* 左:返回工作台 + 标题(主角) */}
            <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                <Link
                    href="/dashboard"
                    aria-label={t('header.backToDashboard')}
                    title={t('header.backToDashboard')}
                    className="group -ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-mr-surface-soft hover:text-neutral-200"
                >
                    <ChevronLeft size={18} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
                </Link>
                <ResumeSwitcher />
            </div>
        </motion.header>
    );
}
