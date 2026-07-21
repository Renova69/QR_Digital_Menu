import React, { useState } from "react";
import { useMenuContext } from "../../context/MenuContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ImageUploadInput } from "../ui/ImageUploadInput";
import { Modal } from "../ui/modal";
import { useToast } from "../ui/toast";
import { Item, RewardPointsMode } from "../../types";
import { useTranslation } from "react-i18next";
import { getApiError } from "../../lib/apiError";
import { UpsellContextSelector } from "./UpsellContextSelector";
import { UpsellContext } from "../../lib/upsellContexts";
import { RewardPricingFields } from "./RewardPricingFields";
import { TagPicker } from "./TagPicker";
import { ALLERGEN_TAGS, DIETARY_TAGS } from "../../lib/menuTags";

interface EditItemFormProps {
  item: Item;
  trigger?: React.ReactNode;
}

export const EditItemForm: React.FC<EditItemFormProps> = ({
  item,
  trigger,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { updateItem, categories } = useMenuContext();

  const allItems = categories ? categories.flatMap((c) => c.items || []) : [];
  const otherItems = allItems.filter((i) => i.id !== item.id);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [price, setPrice] = useState(item.price.toString());
  const [costPrice, setCostPrice] = useState(item.costPrice?.toString() || "");
  const [weight, setWeight] = useState(item.weight || "");
  const [allergens, setAllergens] = useState<string[]>(item.allergens || []);
  const [dietaryTags, setDietaryTags] = useState<string[]>(
    item.dietaryTags || [],
  );
  const [isFeatured, setIsFeatured] = useState(item.isFeatured || false);
  const [upsellContexts, setUpsellContexts] = useState<UpsellContext[]>(
    item.upsellContexts || [],
  );
  const [rewardPointsMode, setRewardPointsMode] = useState<RewardPointsMode>(
    item.rewardPointsMode ?? (item.rewardPointsPrice ? "CUSTOM" : "OFF"),
  );
  const [rewardPointsPrice, setRewardPointsPrice] = useState(
    item.rewardPointsPrice?.toString() || "",
  );
  const [relatedItemIds, setRelatedItemIds] = useState<string[]>(
    item.relatedItemIds || [],
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateItem(item.id, {
        name,
        description,
        price: parseFloat(price),
        weight: weight.trim() || undefined,
        currency: "EUR",
        allergens,
        dietaryTags,
        isFeatured,
        upsellContexts,
        costPrice: costPrice ? parseFloat(costPrice) : undefined,
        rewardPointsMode,
        rewardPointsPrice:
          rewardPointsMode === "CUSTOM" && rewardPointsPrice
            ? parseInt(rewardPointsPrice)
            : undefined,
        relatedItemIds,
        imageFile,
        imageRemoved,
      });
      showToast(
        t("forms.itemUpdated", "Item updated successfully."),
        "success",
      );
      setOpen(false);
    } catch (error: any) {
      showToast(t(getApiError(error)), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {ToastComponent}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("auto.editItem", "Edit Item")}
        description={t("forms.editItemDescription", {
          name: item.name,
          defaultValue: 'Update the details for "{{name}}".',
        })}
        trigger={
          trigger || (
            <Button variant="outline" size="sm">
              {t("auto.edit", "Edit")}
            </Button>
          )
        }
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4 max-h-[80vh] overflow-y-auto pr-2"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("auto.itemName", "Item Name *")}
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auto.eGGreekSalad", "e.g. Greek Salad")}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("auto.description", "Description")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("auto.itemDescription", "Item description")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("auto.price", "Price (€) *")}
            </label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
              step="0.01"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.costPrice", "Item Cost")} (€)
            </label>
            <Input
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "forms.costPriceHint",
                "What this item costs you to make. Used for profit analytics.",
              )}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.weight", "Weight / serving size")}
            </label>
            <Input
              type="text"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={t("forms.weightPlaceholder", "e.g. 350 g")}
              maxLength={100}
            />
          </div>

          <div className="flex items-center space-x-2 pt-2 border-t mt-4 border-border/50">
            <input
              type="checkbox"
              id={`isFeatured-${item.id}`}
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <label
              htmlFor={`isFeatured-${item.id}`}
              className="text-sm font-bold text-foreground"
            >
              {t(
                "auto.FeatureItemTrendingNow",
                "⭐ Feature Item (Trending Now)",
              )}
            </label>
          </div>

          <UpsellContextSelector
            value={upsellContexts}
            onChange={setUpsellContexts}
          />

          <RewardPricingFields
            fieldId={item.id}
            mode={rewardPointsMode}
            onModeChange={setRewardPointsMode}
            customPoints={rewardPointsPrice}
            onCustomPointsChange={setRewardPointsPrice}
            itemPrice={price}
          />

          <div className="space-y-2 pb-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {t("auto.perfectPairings", "Perfect Pairings")}
            </label>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto p-2 border border-border/50 rounded bg-secondary/20">
              {otherItems.length > 0 ? (
                otherItems.map((otherItem) => (
                  <label
                    key={otherItem.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-secondary/50 p-1 rounded transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={relatedItemIds.includes(otherItem.id)}
                      onChange={(e) => {
                        if (e.target.checked)
                          setRelatedItemIds([...relatedItemIds, otherItem.id]);
                        else
                          setRelatedItemIds(
                            relatedItemIds.filter((id) => id !== otherItem.id),
                          );
                      }}
                      className="w-3.5 h-3.5 rounded border-border/70 text-primary focus:ring-primary focus:ring-1"
                    />
                    <span className="text-xs text-foreground group-hover:text-primary font-medium">
                      {otherItem.name}
                    </span>
                  </label>
                ))
              ) : (
                <span className="text-xs text-muted-foreground px-1">
                  {t("auto.noOtherItemsAvailable", "No other items available.")}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t(
                "auto.selectItemsThatGoWellWithThis",
                "Select items that go well with this.",
              )}
            </p>
          </div>

          <div className="border-t border-border/50 pt-4">
            <TagPicker
              label={t("forms.allergens", "Allergens")}
              value={allergens}
              onChange={setAllergens}
              options={ALLERGEN_TAGS}
              placeholder={t("tagPicker.addAllergen", "+ Add allergen")}
            />
          </div>

          <TagPicker
            label={t("forms.dietaryTags", "Dietary Tags")}
            value={dietaryTags}
            onChange={setDietaryTags}
            options={DIETARY_TAGS}
            placeholder={t("tagPicker.addDietaryTag", "+ Add dietary tag")}
          />

          <ImageUploadInput
            currentImageUrl={item.imageUrl}
            onFileSelect={(file) => {
              setImageFile(file);
              if (file) setImageRemoved(false);
            }}
            onRemove={() => {
              setImageRemoved(true);
              setImageFile(null);
            }}
            label={t("auto.updateImageOptional", "Update Image (optional)")}
            aspectRatio="wide"
          />

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting
              ? t("forms.saving", "Saving...")
              : t("forms.saveChanges", "Save Changes")}
          </Button>
        </form>
      </Modal>
    </>
  );
};
