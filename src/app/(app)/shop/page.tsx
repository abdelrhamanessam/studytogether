"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CircleDollarSign,
  ShoppingCart,
  Package,
  Sparkles,
  Tag,
  RefreshCw,
  Loader2,
  Check,
  Zap,
} from "lucide-react";
import type { ShopItem, UserInventory, DailyShopEntry } from "@/types";

type View = "shop" | "inventory";

interface CategoryTabDef {
  id: string;
  label: string;
  categories: ShopItem["category"][];
}

const CATEGORY_TABS: CategoryTabDef[] = [
  {
    id: "all",
    label: "All",
    categories: ["background", "title", "badge", "name_effect", "xp_boost"],
  },
  { id: "background", label: "Backgrounds", categories: ["background"] },
  { id: "title", label: "Titles", categories: ["title"] },
  { id: "badge", label: "Badges", categories: ["badge"] },
  { id: "name_effect", label: "Name FX", categories: ["name_effect"] },
  { id: "xp_boost", label: "XP Boosts", categories: ["xp_boost"] },
];

const RARITY_CONFIG: Record<
  ShopItem["rarity"],
  { label: string; border: string; badgeVariant?: BadgeVariant; badgeClassName?: string }
> = {
  common: { label: "Common", border: "border-muted", badgeVariant: "muted" },
  uncommon: { label: "Uncommon", border: "border-success/30", badgeVariant: "success" },
  rare: {
    label: "Rare",
    border: "border-blue-400/30",
    badgeClassName: "bg-blue-400/15 text-blue-400",
  },
  epic: {
    label: "Epic",
    border: "border-purple-400/30",
    badgeClassName: "bg-purple-400/15 text-purple-400",
  },
  legendary: {
    label: "Legendary",
    border: "border-yellow-400/30",
    badgeClassName: "bg-yellow-400/15 text-yellow-400",
  },
};

function getToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getDiscountedPrice(price: number, discount: number): number {
  return Math.max(1, Math.round(price * (1 - discount / 100)));
}

function RarityBadge({ rarity }: { rarity: ShopItem["rarity"] }) {
  const config = RARITY_CONFIG[rarity];
  return (
    <Badge variant={config.badgeVariant ?? "default"} className={config.badgeClassName}>
      {config.label}
    </Badge>
  );
}

interface ItemCardProps {
  item: ShopItem;
  owned: boolean;
  equipped?: boolean;
  discount?: number;
  coins: number;
  purchasing: boolean;
  loading?: boolean;
  onBuy: (itemId: string) => void;
  onEquip?: (itemId: string) => void;
}

function ItemCard({ item, owned, equipped, discount, coins, purchasing, loading, onBuy, onEquip }: ItemCardProps) {
  const config = RARITY_CONFIG[item.rarity];
  const finalPrice = discount ? getDiscountedPrice(item.price, discount) : item.price;
  const canAfford = coins >= finalPrice;
  const isBoost = item.category === "xp_boost";
  const bgClass = item.category === "background" && item.data?.value ? String(item.data.value) : null;
  const fxClass = item.category === "name_effect" && item.data?.effect ? `name-effect-${item.data.effect}` : null;

  return (
    <Card
      padding="sm"
      className={cn(
        "relative flex flex-col border-2 transition-transform duration-200 hover:-translate-y-0.5",
        config.border,
      )}
    >
      {discount ? (
        <Badge
          variant="danger"
          size="sm"
          className="absolute -top-2 right-3 z-10 gap-1 font-semibold"
        >
          <Tag className="h-3 w-3" />
          -{discount}%
        </Badge>
      ) : null}

      {bgClass ? (
        <div
          aria-hidden
          className={cn(
            "relative mb-3 h-24 w-full overflow-hidden rounded-xl border border-border",
            bgClass,
            owned && equipped && "ring-2 ring-primary/60",
          )}
        >
          <span className="absolute bottom-1.5 left-2 text-[10px] font-medium uppercase tracking-wider text-white/80">
            Live preview
          </span>
        </div>
      ) : null}

      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        <div className="flex items-start justify-between gap-2">
          {fxClass ? (
            <h3 className={cn("text-sm font-semibold leading-snug", fxClass)}>{item.name}</h3>
          ) : (
            <h3 className="text-sm font-semibold leading-snug text-foreground">{item.name}</h3>
          )}
          <RarityBadge rarity={item.rarity} />
        </div>

        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <CircleDollarSign className="h-4 w-4 shrink-0 text-warning" />
            {discount ? (
              <>
                <span className="text-xs text-muted-foreground line-through">{item.price}</span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {finalPrice}
                </span>
              </>
            ) : (
              <span className="text-sm font-bold tabular-nums text-foreground">{finalPrice}</span>
            )}
          </div>

          {owned ? (
            <div className="flex items-center gap-1.5">
              {!isBoost && equipped && (
                <Badge variant="default" size="sm" className="gap-1">
                  <Check className="h-3 w-3" />
                  Active
                </Badge>
              )}
              {isBoost ? (
                <Button
                  size="sm"
                  variant="primary"
                  loading={loading}
                  onClick={() => onEquip?.(item.id)}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Use
                </Button>
              ) : equipped ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={loading}
                  onClick={() => onEquip?.(item.id)}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={loading}
                  onClick={() => onEquip?.(item.id)}
                >
                  Equip
                </Button>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              loading={purchasing}
              disabled={!canAfford}
              onClick={() => onBuy(item.id)}
            >
              {!purchasing && <ShoppingCart className="h-3.5 w-3.5" />}
              {canAfford ? "Buy" : "Low coins"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ShopPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState<string>("");
  const [coins, setCoins] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<UserInventory[]>([]);
  const [dailyItems, setDailyItems] = useState<DailyShopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("shop");
  const [category, setCategory] = useState<string>("all");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [hoursUntilReset, setHoursUntilReset] = useState(0);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, error = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, error });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchCoinsAndInventory = useCallback(
    async (uid: string) => {
      const [profileRes, invRes] = await Promise.all([
        supabase.from("profiles").select("coins").eq("id", uid).single(),
        supabase.from("user_inventory").select("*, shop_items(*)").eq("user_id", uid),
      ]);
      if (profileRes.data) setCoins(profileRes.data.coins);
      if (invRes.data) setInventory(invRes.data as UserInventory[]);
    },
    [supabase],
  );

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const [itemsRes] = await Promise.all([
      supabase.from("shop_items").select("*").eq("is_active", true).order("category"),
      fetchCoinsAndInventory(user.id),
    ]);
    setItems((itemsRes.data ?? []) as ShopItem[]);

    const today = getToday();
    const { data: daily } = await supabase
      .from("daily_shop")
      .select("*, shop_items(*)")
      .eq("shop_date", today);

    let dailyEntries = daily ?? [];
    if (dailyEntries.length === 0) {
      await supabase.rpc("generate_daily_shop");
      const { data: regenerated } = await supabase
        .from("daily_shop")
        .select("*, shop_items(*)")
        .eq("shop_date", today);
      dailyEntries = regenerated ?? [];
    }
    setDailyItems(dailyEntries.filter((entry) => entry.shop_items) as DailyShopEntry[]);

    setLoading(false);
  }, [supabase, fetchCoinsAndInventory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function updateResetTimer() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      setHoursUntilReset(
        Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / (1000 * 60 * 60))),
      );
    }
    updateResetTimer();
    const interval = setInterval(updateResetTimer, 60_000);
    return () => clearInterval(interval);
  }, []);

  const ownedItemIds = useMemo(() => new Set(inventory.map((entry) => entry.item_id)), [inventory]);

  const equippedItemIds = useMemo(
    () => new Set(inventory.filter((e) => e.equipped).map((e) => e.item_id)),
    [inventory],
  );

  async function handleEquipFromShop(itemId: string) {
    const invEntry = inventory.find((e) => e.item_id === itemId);
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    if (item.category === "xp_boost") {
      setEquippingId(itemId);
      const { error } = await supabase.rpc("use_boost", {
        p_user_id: userId,
        p_item_id: itemId,
      });
      setEquippingId(null);
      if (error) {
        showToast(error.message || "Failed to activate boost", true);
        return;
      }
      showToast(`${item.name} activated!`);
      return;
    }

    const currentlyEquipped = equippedItemIds.has(itemId);
    setEquippingId(itemId);
    const { error } = await supabase.rpc("equip_item", {
      p_user_id: userId,
      p_item_id: itemId,
      p_equip: !currentlyEquipped,
    });
    setEquippingId(null);

    if (error) {
      showToast(error.message || "Failed to update item", true);
      return;
    }

    showToast(currentlyEquipped ? "Item unequipped" : "Item equipped");
    await fetchCoinsAndInventory(userId);
    router.refresh();
  }

  const activeTab = useMemo(
    () => CATEGORY_TABS.find((tab) => tab.id === category) ?? CATEGORY_TABS[0],
    [category],
  );

  const filteredItems = useMemo(
    () => items.filter((item) => activeTab.categories.includes(item.category)),
    [items, activeTab],
  );

  async function handleBuy(itemId: string) {
    setPurchasingId(itemId);
    const { error } = await supabase.rpc("buy_shop_item", {
      p_user_id: userId,
      p_item_id: itemId,
    });
    setPurchasingId(null);

    if (error) {
      showToast(error.message || "Purchase failed", true);
      return;
    }

    showToast("Purchased!");
    await fetchCoinsAndInventory(userId);
  }

  async function handleToggleEquip(entry: UserInventory) {
    const item = entry.shop_items;
    if (!item) return;

    if (item.category === "xp_boost") {
      setEquippingId(entry.id);
      const { error } = await supabase.rpc("use_boost", {
        p_user_id: userId,
        p_item_id: entry.item_id,
      });
      setEquippingId(null);
      if (error) {
        showToast(error.message || "Failed to activate boost", true);
        return;
      }
      showToast(`${item.name} activated!`);
      return;
    }

    const nextEquipped = !entry.equipped;
    setEquippingId(entry.id);
    const { error } = await supabase.rpc("equip_item", {
      p_user_id: userId,
      p_item_id: entry.item_id,
      p_equip: nextEquipped,
    });
    setEquippingId(null);

    if (error) {
      showToast(error.message || "Failed to update item", true);
      return;
    }

    showToast(nextEquipped ? "Item equipped" : "Item unequipped");
    const { data } = await supabase
      .from("user_inventory")
      .select("*, shop_items(*)")
      .eq("user_id", userId);
    if (data) setInventory(data as unknown as UserInventory[]);
    router.refresh();
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="sticky top-0 z-20 -mx-1 bg-background/80 px-1 pb-3 pt-1 backdrop-blur-md">
        <div className="animate-fade-in flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <CircleDollarSign className="h-7 w-7 shrink-0 text-warning" />
              Shop
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              Spend coins on cosmetics and boosts
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2">
              <CircleDollarSign className="h-5 w-5 text-warning" />
              <span className="text-lg font-bold tabular-nums text-foreground">
                {coins.toLocaleString()}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh} aria-label="Refresh shop">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      <div className="animate-fade-in flex items-center gap-1 rounded-xl bg-muted p-1">
        <button
          onClick={() => setView("shop")}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            view === "shop"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ShoppingCart className="h-4 w-4" />
          Shop
        </button>
        <button
          onClick={() => setView("inventory")}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            view === "inventory"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Package className="h-4 w-4" />
          My Items ({inventory.length})
        </button>
      </div>

      {view === "shop" ? (
        <>
          <Card
            glow
            padding="lg"
            className="animate-fade-in bg-gradient-to-br from-primary/10 via-transparent to-transparent"
          >
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Daily Shop
                </CardTitle>
                <Badge variant="warning" className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Resets in {hoursUntilReset}h
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Handpicked deals with discounts, refreshed every day
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {dailyItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No daily deals available right now
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {dailyItems.slice(0, 5).map((entry) => (
                    <ItemCard
                      key={entry.id}
                      item={entry.shop_items as ShopItem}
                      owned={ownedItemIds.has(entry.item_id)}
                      equipped={equippedItemIds.has(entry.item_id)}
                      discount={entry.discount}
                      coins={coins}
                      purchasing={purchasingId === entry.item_id}
                      loading={equippingId === entry.item_id}
                      onBuy={handleBuy}
                      onEquip={handleEquipFromShop}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="animate-fade-in flex items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCategory(tab.id)}
                className={cn(
                  "shrink-0 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  category === tab.id
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
              <Tag className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No items in this category yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  owned={ownedItemIds.has(item.id)}
                  equipped={equippedItemIds.has(item.id)}
                  coins={coins}
                  purchasing={purchasingId === item.id}
                  loading={equippingId === item.id}
                  onBuy={handleBuy}
                  onEquip={handleEquipFromShop}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="animate-fade-in text-lg font-semibold tracking-tight">My Items</h2>

          {inventory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
              <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Your inventory is empty — visit the shop to buy something
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {inventory.map((entry) => {
                const item = entry.shop_items;
                if (!item) return null;
                const config = RARITY_CONFIG[item.rarity];

                return (
                  <Card
                    key={entry.id}
                    padding="sm"
                    className={cn(
                      "flex flex-col border-2 transition-transform duration-200 hover:-translate-y-0.5",
                      config.border,
                      entry.equipped && "ring-1 ring-primary/40",
                    )}
                  >
                    <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                          {item.name}
                        </h3>
                        <RarityBadge rarity={item.rarity} />
                      </div>

                      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        {item.category === "xp_boost" ? (
                          <span className="text-xs text-muted-foreground">Consumable</span>
                        ) : entry.equipped ? (
                          <Badge variant="default" size="sm" className="gap-1">
                            <Check className="h-3 w-3" />
                            Equipped
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not equipped</span>
                        )}

                        <Button
                          size="sm"
                          variant={item.category === "xp_boost" ? "primary" : entry.equipped ? "outline" : "secondary"}
                          loading={equippingId === entry.id}
                          onClick={() => handleToggleEquip(entry)}
                        >
                          {item.category === "xp_boost" ? "Use" : entry.equipped ? "Unequip" : "Equip"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg",
              toast.error ? "bg-danger text-white" : "bg-success text-white",
            )}
          >
            {toast.error ? (
              <CircleDollarSign className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
