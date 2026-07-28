import React, { useState } from "react";
import { useMenuContext } from "../../context/MenuContext";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "../ui/SortableItem";
import { Button } from "../ui/button";
import { ManageOptionsModal } from "./ManageOptionsModal";
import { EditItemForm } from "./EditItemForm";
import { Item } from "../../types";
import {
  Trash2,
  Edit,
  Plus,
  Info,
  GripVertical,
  Star,
  Ban,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveTag } from "../../lib/menuTags";

export const ItemList: React.FC = () => {
  const { items, isLoadingItems, selectedCategory, deleteItem, updateItem } =
    useMenuContext();
  const [selectedItemForOptions, setSelectedItemForOptions] =
    useState<Item | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const { t } = useTranslation();

  const handleDelete = async (id: string) => {
    setConfirmingDeleteId(null);
    await deleteItem(id);
  };

  const handleToggleFeatured = async (item: Item) => {
    try {
      await updateItem(item.id, { isFeatured: !item.isFeatured });
    } catch (error) {
      console.error("Failed to toggle featured status", error);
    }
  };

  // "86" toggle — operational out-of-stock switch (item-availability gap).
  const handleToggleOutOfStock = async (item: Item) => {
    try {
      await updateItem(item.id, { isOutOfStock: !item.isOutOfStock });
    } catch (error) {
      console.error("Failed to toggle out-of-stock status", error);
    }
  };

  if (!selectedCategory) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-secondary/50 p-4 text-center sm:p-12">
        <div className="bg-card p-3 rounded-full shadow-sm mb-4">
          <Plus className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground">
          {t("menuAdmin.noCategory", "No Category Selected")}
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs mt-1">
          {t(
            "menuAdmin.selectCategoryPrompt",
            "Select a category on the left to manage its menu items.",
          )}
        </p>
      </div>
    );
  }

  if (isLoadingItems) {
    return (
      <div className="flex justify-center p-4 sm:p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <SortableContext
        items={items?.map((i) => i.id) || []}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {items && items.length > 0 ? (
            items.map((item) => (
              <SortableItem key={item.id} id={item.id}>
                <ItemRow
                  item={item}
                  onDelete={handleDelete}
                  onOpenOptions={setSelectedItemForOptions}
                  onToggleFeatured={handleToggleFeatured}
                  onToggleOutOfStock={handleToggleOutOfStock}
                  isConfirmingDelete={confirmingDeleteId === item.id}
                  onRequestDelete={() => setConfirmingDeleteId(item.id)}
                  onCancelDelete={() => setConfirmingDeleteId(null)}
                  t={t}
                />
              </SortableItem>
            ))
          ) : (
            <div className="rounded-lg border-2 border-dashed p-4 text-center sm:p-12">
              <p className="text-muted-foreground">
                {t(
                  "menuAdmin.emptyCategory",
                  "This category is currently empty.",
                )}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {t(
                  "menuAdmin.addItemsPrompt",
                  "Add items using the form below.",
                )}
              </p>
            </div>
          )}
        </div>
      </SortableContext>

      {selectedItemForOptions && (
        <ManageOptionsModal
          item={selectedItemForOptions}
          open={!!selectedItemForOptions}
          onOpenChange={(open) => !open && setSelectedItemForOptions(null)}
        />
      )}
    </>
  );
};

// Extracted row component receives dragHandleProps from SortableItem
const ItemRow = ({
  item,
  onDelete,
  onOpenOptions,
  onToggleFeatured,
  onToggleOutOfStock,
  isConfirmingDelete,
  onRequestDelete,
  onCancelDelete,
  dragHandleProps,
  t,
}: {
  item: Item;
  onDelete: (id: string) => void;
  onOpenOptions: (item: Item) => void;
  onToggleFeatured: (item: Item) => void;
  onToggleOutOfStock: (item: Item) => void;
  isConfirmingDelete: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  dragHandleProps?: any;
  t: any;
}) => {
  return (
    <div className="group flex min-w-0 flex-col items-start justify-between gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 sm:flex-row sm:items-center">
      <div className="flex w-full min-w-0 flex-1 items-start gap-3">
        {/* Drag handle - only this triggers drag */}
        <span
          {...dragHandleProps}
          className="mt-1 flex-shrink-0 touch-none select-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        {item.imageUrl && (
          <div className="h-16 w-16 min-w-[4rem] shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
            <img
              src={
                item.imageUrl.startsWith("http")
                  ? item.imageUrl
                  : `${(import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace("/api", "")}/${item.imageUrl}`
              }
              alt={item.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <h4 className="max-w-full break-words font-bold text-foreground">
              {item.name}
            </h4>
            {item.isOutOfStock && (
              <span className="shrink-0 rounded-full border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                {t("menuAdmin.outOfStock", "86'd")}
              </span>
            )}
            <div className="flex flex-wrap max-w-full gap-1">
              {item.dietaryTags?.map((tag) => {
                const preset = resolveTag(tag);
                const label = preset ? t(preset.labelKey, tag) : tag;
                return (
                  <span
                    key={tag}
                    className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-green-100 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
                  >
                    {preset && <preset.Icon className="h-2.5 w-2.5 shrink-0" />}
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
          <p className="mt-0.5 line-clamp-2 sm:line-clamp-1 break-words text-xs text-muted-foreground">
            {item.description}
          </p>
          <div className="mt-2 flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 font-bold text-primary">
              {item.currency === "BGN" ? "лв" : "€"}
              {item.price.toFixed(2)}
            </span>
            {item.allergens && item.allergens.length > 0 && (
              <div className="flex flex-wrap max-w-full min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <Info className="h-3 w-3 flex-shrink-0" />
                <span>{t("publicMenu.contains", "Contains")}:</span>
                {item.allergens.map((tag) => {
                  const preset = resolveTag(tag);
                  const label = preset ? t(preset.labelKey, tag) : tag;
                  return (
                    <span
                      key={tag}
                      className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-amber-700"
                    >
                      {preset && (
                        <preset.Icon className="h-2.5 w-2.5 shrink-0" />
                      )}
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons - NOT inside drag target */}
      <div className="flex w-full flex-wrap items-center justify-end gap-2 self-end sm:w-auto sm:self-auto">
        {isConfirmingDelete ? (
          <>
            <span className="text-xs text-red-600 font-medium">
              {t("menuAdmin.confirmDelete", "Delete?")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:bg-secondary"
              onClick={onCancelDelete}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs bg-red-600 text-white hover:bg-red-700"
              onClick={() => onDelete(item.id)}
            >
              {t("common.delete", "Delete")}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${item.isFeatured ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50" : "text-muted-foreground hover:text-yellow-500"}`}
              title={t("auto.featureItem", "Feature Item")}
              onClick={() => onToggleFeatured(item)}
            >
              <Star
                className="h-4 w-4"
                fill={item.isFeatured ? "currentColor" : "none"}
              />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${item.isOutOfStock ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-muted-foreground hover:text-red-600"}`}
              title={t(
                "menuAdmin.toggleOutOfStock",
                "Toggle out of stock (86)",
              )}
              onClick={() => onToggleOutOfStock(item)}
            >
              <Ban className="h-4 w-4" />
            </Button>

            <EditItemForm
              item={item}
              trigger={
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </Button>
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenOptions(item)}
              className="text-[11px] h-8"
            >
              {t("menuAdmin.optionsBtn", "Options")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
              onClick={onRequestDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
