import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Item, MenuOption } from "../../types";
import { OptionType } from "@prisma/client";
import api from "../../lib/api";
import { getApiError } from "../../lib/apiError";
import { Plus, Trash2, X, Wand2, Pencil } from "lucide-react";

interface ManageOptionsModalProps {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChoiceInput {
  clientId: string;
  name: string;
  priceModifier: number;
}

let fallbackChoiceId = 0;

const createClientId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  fallbackChoiceId += 1;
  return `choice-${Date.now().toString(36)}-${fallbackChoiceId.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createChoiceInput = (
  choice: Omit<ChoiceInput, "clientId"> = { name: "", priceModifier: 0 },
): ChoiceInput => ({
  clientId: createClientId(),
  ...choice,
});

const PRESETS = {
  SIZE: {
    name: "Size",
    type: "VARIATION" as OptionType,
    choices: [
      { name: "Small", priceModifier: 0 },
      { name: "Medium", priceModifier: 2 },
      { name: "Large", priceModifier: 4 },
    ],
  },
  DONENESS: {
    name: "Steak Doneness",
    type: "VARIATION" as OptionType,
    choices: [
      { name: "Rare", priceModifier: 0 },
      { name: "Medium Rare", priceModifier: 0 },
      { name: "Medium", priceModifier: 0 },
      { name: "Medium Well", priceModifier: 0 },
      { name: "Well Done", priceModifier: 0 },
    ],
  },
  QUANTITY: {
    name: "Quantity",
    type: "VARIATION" as OptionType,
    choices: [
      { name: "Half dozen", priceModifier: 0 },
      { name: "Full dozen", priceModifier: 10 },
    ],
  },
};

export const ManageOptionsModal: React.FC<ManageOptionsModalProps> = ({
  item,
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<MenuOption[]>(item.options || []);

  // New Option State
  const [isAdding, setIsAdding] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionType, setNewOptionType] = useState<OptionType>("VARIATION");
  const [choices, setChoices] = useState<ChoiceInput[]>([createChoiceInput()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleApplyPreset = (presetKey: keyof typeof PRESETS) => {
    const preset = PRESETS[presetKey];
    setNewOptionName(preset.name);
    setNewOptionType(preset.type);
    setChoices(preset.choices.map((choice) => createChoiceInput(choice)));
    setEditingId(null);
    setIsAdding(true);
    setErrorMsg(null);
  };

  const handleStartEdit = (option: MenuOption) => {
    const parsedChoices: ChoiceInput[] = (option.choices as any[]).map(
      (c: any) => ({
        clientId: c.id ?? createClientId(),
        name: c.name,
        priceModifier: c.priceModifier ?? 0,
      }),
    );
    setNewOptionName(option.name);
    setNewOptionType(option.type as OptionType);
    setChoices(
      parsedChoices.length > 0 ? parsedChoices : [createChoiceInput()],
    );
    setEditingId(option.id);
    setIsAdding(true);
    setErrorMsg(null);
  };

  const handleAddChoiceRow = () => {
    setChoices([...choices, createChoiceInput()]);
  };

  const handleRemoveChoiceRow = (index: number) => {
    const newChoices = [...choices];
    newChoices.splice(index, 1);
    setChoices(newChoices);
  };

  const handleChoiceChange = (
    index: number,
    field: keyof ChoiceInput,
    value: string | number,
  ) => {
    const newChoices = [...choices];
    newChoices[index] = { ...newChoices[index], [field]: value };
    setChoices(newChoices);
  };

  const handleSaveOption = async () => {
    if (!newOptionName.trim()) return;

    // Filter out empty choices
    const validChoices = choices
      .filter((c) => c.name.trim() !== "")
      .map(({ name, priceModifier }) => ({ name, priceModifier }));
    if (validChoices.length === 0) return;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const payload = {
        name: newOptionName,
        type: newOptionType,
        choices: JSON.stringify(validChoices),
      };

      if (editingId) {
        const updated = await api.patch(`/options/${editingId}`, payload);
        setOptions(
          options.map((opt) => (opt.id === editingId ? updated.data : opt)),
        );
      } else {
        const created = await api.post(`/items/${item.id}/options`, payload);
        setOptions([...options, created.data]);
      }

      // Reset form
      setNewOptionName("");
      setNewOptionType("VARIATION");
      setChoices([createChoiceInput()]);
      setEditingId(null);
      setIsAdding(false);
    } catch (error: any) {
      console.error("Failed to save option", error);
      setErrorMsg(t(getApiError(error)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm("Are you sure you want to delete this option?")) return;
    try {
      await api.delete(`/options/${optionId}`);
      setOptions(options.filter((opt) => opt.id !== optionId));
    } catch (error) {
      console.error("Failed to delete option", error);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`${t("menu.options", "Options:")} ${item.name}`}
    >
      <div className="max-h-[70vh] w-full max-w-2xl overflow-y-auto pr-1">
        <h2 className="mb-6 text-xl font-display font-bold sm:text-2xl">
          {t("menu.options", "Options:")}{" "}
          <span className="text-primary">{item.name}</span>
        </h2>

        {/* Existing Options */}
        <div className="space-y-4 mb-8">
          {options.length === 0 && !isAdding && (
            <div className="text-center p-8 bg-secondary/30 rounded-xl border border-dashed border-border">
              <p className="text-muted-foreground mb-5">
                {t(
                  "auto.noOptionsConfiguredForThisItemYet",
                  "No options configured for this item yet.",
                )}
              </p>
              <div className="flex items-center justify-center mb-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  {t("menu.quickTemplates", "Quick Templates")}
                </h3>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mb-5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("SIZE")}
                  className="gap-2 border-primary/30 hover:border-primary"
                >
                  <Wand2 className="w-3 h-3 text-primary" />{" "}
                  {t("menu.size", "Size")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("DONENESS")}
                  className="gap-2 border-primary/30 hover:border-primary"
                >
                  <Wand2 className="w-3 h-3 text-primary" />{" "}
                  {t("menu.doneness", "Doneness")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("QUANTITY")}
                  className="gap-2 border-primary/30 hover:border-primary"
                >
                  <Wand2 className="w-3 h-3 text-primary" />{" "}
                  {t("menu.quantity", "Quantity")}
                </Button>
              </div>
              <Button
                onClick={() => {
                  setIsAdding(true);
                  setEditingId(null);
                }}
                variant="outline"
                className="gap-2"
              >
                <Plus className="w-4 h-4" />{" "}
                {t("menu.createCustomOption", "Create Custom Option")}
              </Button>
            </div>
          )}

          {options.map((option) => {
            const parsedChoices = Array.isArray(option.choices)
              ? option.choices
              : [];
            return (
              <div
                key={option.id}
                className="p-5 bg-card border border-border rounded-xl shadow-sm hover:border-primary/30 transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg">{option.name}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-secondary text-secondary-foreground rounded-md">
                        {option.type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(option)}
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteOption(option.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {parsedChoices.map((choice: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                    >
                      <span className="font-medium">{choice.name}</span>
                      {choice.priceModifier !== 0 && (
                        <span className="text-primary font-bold">
                          {choice.priceModifier > 0 ? "+" : ""}€
                          {choice.priceModifier.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Option Form */}
        {isAdding ? (
          <div className="rounded-xl border border-border bg-secondary/20 p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">
                {editingId ? "Edit Option" : "Create New Option"}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setEditingId(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {t("auto.optionName", "Option Name")}
                </label>
                <Input
                  placeholder={t(
                    "auto.eGSizeDonenessExtras",
                    "e.g., Size, Doneness, Extras",
                  )}
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {t("auto.type", "Type")}
                </label>
                <select
                  value={newOptionType}
                  onChange={(e) =>
                    setNewOptionType(e.target.value as OptionType)
                  }
                  className="w-full h-10 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="VARIATION">
                    {t(
                      "auto.variationCustomerChoosesOne",
                      "Variation (Customer chooses one)",
                    )}
                  </option>
                  <option value="ADDON">
                    {t(
                      "auto.addOnCustomerCanChooseMultiple",
                      "Add-on (Customer can choose multiple)",
                    )}
                  </option>
                </select>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-muted-foreground">
                  {t("auto.choices", "Choices")}
                </label>
              </div>

              {choices.map((choice, index) => (
                <div
                  key={choice.clientId}
                  className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <Input
                      placeholder={t(
                        "auto.choiceNameEGSmallRare",
                        "Choice name (e.g., Small, Rare)",
                      )}
                      value={choice.name}
                      onChange={(e) =>
                        handleChoiceChange(index, "name", e.target.value)
                      }
                    />
                  </div>
                  <div className="relative w-full sm:w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      +€
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      className="pl-8"
                      value={choice.priceModifier}
                      onChange={(e) =>
                        handleChoiceChange(
                          index,
                          "priceModifier",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveChoiceRow(index)}
                    disabled={choices.length === 1}
                    className="self-end text-muted-foreground hover:text-red-500 sm:self-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddChoiceRow}
                className="mt-2 text-xs gap-1"
              >
                <Plus className="w-3 h-3" /> {t("auto.addChoice", "Add Choice")}
              </Button>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm">
                  {errorMsg}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                  }}
                >
                  {t("auto.cancel", "Cancel")}
                </Button>
                <Button
                  onClick={handleSaveOption}
                  disabled={isSaving || !newOptionName.trim()}
                >
                  {isSaving
                    ? "Saving..."
                    : editingId
                      ? "Update Option"
                      : "Save Option"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          options.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  {t("menu.quickTemplates", "Quick Templates")}
                </h3>
              </div>
              <div className="flex flex-wrap gap-3 mb-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("SIZE")}
                  className="gap-2 border-primary/30 hover:border-primary"
                >
                  <Wand2 className="w-3 h-3 text-primary" />{" "}
                  {t("menu.sizeTemplate", "Size Template")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("DONENESS")}
                  className="gap-2 border-primary/30 hover:border-primary"
                >
                  <Wand2 className="w-3 h-3 text-primary" />{" "}
                  {t("menu.donenessTemplate", "Doneness Template")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("QUANTITY")}
                  className="gap-2 border-primary/30 hover:border-primary"
                >
                  <Wand2 className="w-3 h-3 text-primary" />{" "}
                  {t("menu.quantityTemplate", "Quantity Template")}
                </Button>
              </div>
              <Button
                onClick={() => {
                  setIsAdding(true);
                  setEditingId(null);
                }}
                className="w-full gap-2"
              >
                <Plus className="w-4 h-4" />{" "}
                {t("menu.createCustomOption", "Create Custom Option")}
              </Button>
            </div>
          )
        )}
      </div>
    </Modal>
  );
};
