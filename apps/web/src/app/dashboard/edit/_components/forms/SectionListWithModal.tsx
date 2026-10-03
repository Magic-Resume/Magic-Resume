import React, { useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import SectionItemDialog, { type SectionItemField } from './SectionItemDialog';
import { Button } from '@/components/ui/button';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaPlus, FaGripVertical } from '@magic-resume/icons';
import { toast } from 'sonner';
import { DropMenu } from '@/components/ui/drop-menu';
import { DotsHorizontalIcon, Pencil2Icon, CopyIcon, TrashIcon } from '@magic-resume/icons';
import { UniqueIdentifier } from '@dnd-kit/core';

import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from '@magic-resume/icons';

import { useResumeDocumentStore } from '@/store/resume/document';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

interface BaseItem {
  id: UniqueIdentifier;
  visible?: boolean;
  [key: string]: string | number | boolean | undefined;
}

type SortableItemProps<T extends BaseItem> = {
  id: UniqueIdentifier;
  item: T;
  index: number;
  handleEdit: (index: number) => void;
  handleDelete: (index: number) => void;
  handleCopy: (index: number) => void;
  toggleVisibility: (index: number) => void;
  itemRender?: (item: T) => React.ReactNode;
  label: string;
  disabled?: boolean;
};

function SortableItem<T extends BaseItem>({ id, item, index, handleEdit, handleDelete, handleCopy, toggleVisibility, itemRender, disabled }: SortableItemProps<T>) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const menuItems = [
    {
      label: item.visible !== false ? t('sections.shared.hide') : t('sections.shared.show'),
      icon: item.visible !== false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
      onClick: () => toggleVisibility(index),
      separator: true,
    },
    {
      label: t('sections.shared.edit'),
      icon: <Pencil2Icon className="h-4 w-4" />,
      onClick: () => handleEdit(index),
    },
    {
      label: t('sections.shared.copy'),
      icon: <CopyIcon className="h-4 w-4" />,
      onClick: () => handleCopy(index),
    },
    {
      label: t('sections.shared.remove'),
      icon: <TrashIcon className="h-4 w-4" />,
      onClick: () => handleDelete(index),
      variant: 'danger' as const,
      separator: true,
    },
  ];

  return (
    <div ref={setNodeRef} style={style} className={cn("group relative mb-2 flex items-center gap-2 rounded-xl border border-mr-line bg-white/[0.03] p-2.5 transition-colors duration-150 hover:border-white/20", isDragging ? 'opacity-50' : 'opacity-100', item.visible === false && "opacity-50")}>
      <div {...attributes} {...listeners} className={cn("flex h-8 w-5 items-center justify-center text-neutral-400 transition-colors duration-150 hover:text-neutral-100", disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing")}>
        <FaGripVertical size={14} />
      </div>
      <div className="min-w-0 grow">
        {itemRender ? itemRender(item) : (
          <div>
            <p className="truncate font-semibold">{item.title || item.name || item.degree || t('sections.shared.untitled')}</p>
            <p className="truncate text-sm text-neutral-400">{item.subtitle || item.company || item.school || ''}</p>
          </div>
        )}
      </div>
      <DropMenu
        width="w-40"
        side="bottom"
        align="end"
        items={menuItems}
        onOpenChange={setIsMenuOpen}
        trigger={
          <Button 
            variant="ghost" 
            className={cn(
              "h-8 w-8 p-0 outline-none focus:outline-none focus:ring-0 transition-colors",
              isMenuOpen ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            <span className="sr-only">{t('sections.shared.openMenu')}</span>
            <DotsHorizontalIcon className="h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}

type Field = SectionItemField;

interface SectionListWithModalProps<T extends BaseItem> {
  /** Stable section kind (`experience`, `education`…), used for analytics. */
  sectionKey: string;
  label: string;
  fields: Field[];
  richtextKey: string;
  richtextPlaceholder: string;
  items: T[];
  setItems: (items: T[]) => void;
  itemRender?: (item: T) => React.ReactNode;
  className?: string;
  onModalStateChange?: (isOpen: boolean) => void;
}

export default function SectionListWithModal<T extends BaseItem>({
  sectionKey,
  label,
  fields,
  richtextKey,
  richtextPlaceholder,
  items,
  setItems,
  itemRender,
  className,
  onModalStateChange,
}: SectionListWithModalProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<T | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const { t } = useTranslation();
  const { activeResume } = useResumeDocumentStore();

  const translatedLabel = t(label);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleOpenModal = useCallback((item: T | null, index: number | null) => {
    setCurrentItem(item ? { ...item } : { id: nanoid(), visible: true, ...fields.reduce((acc, f) => ({ ...acc, [f.name]: '' }), {} as Record<string, string>), [richtextKey]: '' } as T);
    setCurrentIndex(index);
    setIsOpen(true);
    onModalStateChange?.(true);
  }, [fields, richtextKey, onModalStateChange]);

  const handleCloseModal = useCallback(() => {
    setIsOpen(false);
    setCurrentItem(null);
    setCurrentIndex(null);
    onModalStateChange?.(false);
  }, [onModalStateChange]);

  const handleSave = useCallback((savedItem: T) => {
    const newItems = [...items];
    if (currentIndex !== null) {
      // Locate the row by id, not the captured index: an external reorder (AI accept
      // / cloud sync) while the modal was open could otherwise overwrite the wrong item.
      const targetIndex = items.findIndex((it) => it.id === savedItem.id);
      if (targetIndex !== -1) {
        newItems[targetIndex] = savedItem;
      } else {
        newItems.push(savedItem);
      }
    } else {
      newItems.push(savedItem);
    }
    setItems(newItems as T[]);
    handleCloseModal();
    const isNew = currentIndex === null;
    const notificationMessage = !isNew
      ? t('sections.notifications.sectionUpdated', { label: translatedLabel })
      : t('sections.notifications.sectionAdded', { label: translatedLabel });
    toast.success(notificationMessage);
    // Only a genuinely new entry — editing an existing one is not an addition.
    // The section kind travels, never the entry the user typed.
    if (isNew) appLifecycle.editorSectionAdded({ section: sectionKey });
  }, [items, currentIndex, setItems, handleCloseModal, t, translatedLabel, sectionKey]);

  const handleDelete = useCallback((index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    toast.success(t('sections.notifications.itemRemoved'));
    appLifecycle.editorSectionRemoved({ section: sectionKey });
  }, [items, setItems, t, sectionKey]);

  const handleCopy = useCallback((index: number) => {
    const itemToCopy = items[index];
    const newItem = { ...itemToCopy, id: nanoid() } as T;
    const newItems = [...items.slice(0, index + 1), newItem, ...items.slice(index + 1)];
    setItems(newItems);
    toast.success(t('sections.notifications.itemCopied'));
  }, [items, setItems, t]);

  const toggleVisibility = useCallback((index: number) => {
    const newItems = [...items];
    const item = newItems[index];
    newItems[index] = { ...item, visible: item.visible === false ? true : false };
    setItems(newItems);
    const status = newItems[index].visible !== false ? t('sections.shared.shown') : t('sections.shared.hidden');
    toast.success(t('sections.notifications.visibilityToggled', { status }));
  }, [items, setItems, t]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setItems(arrayMove(items, oldIndex, newIndex));
      }
    }
  }, [items, setItems]);

  return (
    <div className={cn(className)}>
      <div className="mt-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map((item, index) => (
              <SortableItem<T>
                key={item.id}
                id={item.id}
                item={item}
                index={index}
                handleEdit={(i) => handleOpenModal(items[i], i)}
                handleDelete={handleDelete}
                handleCopy={handleCopy}
                toggleVisibility={toggleVisibility}
                itemRender={itemRender}
                label={label}
                disabled={items.length === 1}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => handleOpenModal(null, null)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-mr-surface-subtle px-3 py-2 text-mr-ui font-medium text-neutral-300 transition-colors duration-150 hover:border-sky-400/40 hover:text-white"
          >
            <FaPlus size={11} />
            {t('sections.shared.addItem')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => handleOpenModal(null, null)}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-3 text-mr-ui font-medium text-neutral-300 transition-colors duration-150 hover:border-sky-400/40 hover:text-white"
        >
          <FaPlus size={11} />
          {t('sections.shared.addItem')}
        </button>
      )}
      {currentItem && (
        <SectionItemDialog
          key={currentItem.id}
          open={isOpen}
          initialItem={currentItem}
          isEditing={currentIndex !== null}
          label={translatedLabel}
          fields={fields}
          richtextKey={richtextKey}
          richtextPlaceholder={richtextPlaceholder}
          themeColor={activeResume?.themeColor}
          onSave={handleSave}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
