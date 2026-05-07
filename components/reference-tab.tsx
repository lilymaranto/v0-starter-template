"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/track-event";
import { getBraze, initBraze } from "@/lib/braze";

type RefCard = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  url: string | null;
  linkText: string | null;
  location: string | null;
};

export function ReferenceTab() {
  const [eventLogged, setEventLogged] = useState(false);
  const [cards, setCards] = useState<RefCard[]>([]);
  const [hasBanner, setHasBanner] = useState(false);
  const defaultCardsContainerRef = useRef<HTMLDivElement | null>(null);
  const bannerContainerRef = useRef<HTMLDivElement | null>(null);
  const impressionIdsRef = useRef<Set<string>>(new Set());

  const homeCards = useMemo(
    () => cards.filter((card) => card.location === "home"),
    [cards]
  );
  const nonHomeCards = useMemo(
    () => cards.filter((card) => card.location !== "home"),
    [cards]
  );
  const homeCard = useMemo(() => homeCards[0] ?? null, [homeCards]);

  const handleLogEvent = () => {
    trackEvent("event_logged");
    setEventLogged(true);
    setTimeout(() => setEventLogged(false), 2000);
  };

  useEffect(() => {
    let cardsSubscription: unknown;
    let bannersSubscription: unknown;
    let brazeInstance: any = null;
    let cancelled = false;

    const init = async () => {
      await initBraze();
      const braze = await getBraze();
      if (!braze || cancelled) return;
      brazeInstance = braze;

      try {
        cardsSubscription = braze.subscribeToContentCardsUpdates(
          (response: any) => {
            const incoming = (response?.cards ?? []) as Array<any>;
            const mapped: RefCard[] = incoming.map((card) => ({
              id: card.id ?? `${card.title ?? "card"}-${card.created ?? Date.now()}`,
              title: card.title ?? "Content Card",
              description: card.description ?? "",
              imageUrl: card.imageUrl ?? null,
              url: card.url ?? null,
              linkText: card.linkText ?? null,
              location:
                typeof card?.extras?.location === "string"
                  ? card.extras.location
                  : null,
            }));
            setCards(mapped);

            incoming.forEach((card) => {
              if (!card?.id || impressionIdsRef.current.has(card.id)) return;
              if (typeof (braze as any).logContentCardImpression === "function") {
                (braze as any).logContentCardImpression(card);
              } else if (
                typeof (braze as any).logContentCardImpressions === "function"
              ) {
                (braze as any).logContentCardImpressions([card]);
              }
              impressionIdsRef.current.add(card.id);
            });
          }
        );
        braze.requestContentCardsRefresh();
        if (defaultCardsContainerRef.current) {
          braze.showContentCards(
            defaultCardsContainerRef.current,
            (incomingCards: any[]) =>
              (incomingCards ?? []).filter(
                (card) => card?.extras?.location !== "home"
              )
          );
        }
      } catch {
        // no-op in placeholder mode
      }

      try {
        bannersSubscription = braze.subscribeToBannersUpdates(
          (bannersByPlacement: Record<string, any | null>) => {
            const bannerContainer = bannerContainerRef.current;
            if (!bannerContainer) return;
            bannerContainer.innerHTML = "";
            const banner = bannersByPlacement?.["banner_1"] ?? null;
            if (!banner) {
              setHasBanner(false);
              return;
            }
            braze.insertBanner(banner, bannerContainer);
            setHasBanner(true);
          }
        );
        braze.requestBannersRefresh(["banner_1"]);
      } catch {
        // no-op in placeholder mode
      }
    };

    void init();

    return () => {
      cancelled = true;
      const cleanupSubscription = (subscription: unknown) => {
        if (!subscription) return;
        if (typeof subscription === "function") {
          subscription();
          return;
        }
        if (
          brazeInstance &&
          typeof brazeInstance.removeSubscription === "function"
        ) {
          brazeInstance.removeSubscription(subscription);
        }
      };
      cleanupSubscription(cardsSubscription);
      cleanupSubscription(bannersSubscription);
      if (
        brazeInstance &&
        typeof brazeInstance.hideContentCards === "function"
      ) {
        brazeInstance.hideContentCards(defaultCardsContainerRef.current);
      }
      const bannerContainer = bannerContainerRef.current;
      if (bannerContainer) bannerContainer.innerHTML = "";
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <section
        className="w-full rounded-xl border border-border bg-card p-4"
        aria-label="Braze Reference"
      >
        <h2 className="mb-3 text-base font-semibold text-card-foreground">
          Braze Reference
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Quick reference for Braze SDK integration patterns and common usage.
        </p>
      </section>

      {/* Track Custom Events */}
      <section className="w-full rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-card-foreground">
          Track Custom Events
        </h3>
        <pre className="overflow-x-auto rounded-lg bg-secondary p-3 text-[11px] text-foreground">
{`import { trackEvent } from "@/lib/track-event";
import { useEffect } from "react";

// Track event on mount
useEffect(() => {
  trackEvent("page_viewed", { page: "home" });
}, []);

// Track event on user action (inside handler)
const handlePurchase = () => {
  trackEvent("purchase_completed", {
    product_id: "abc123",
    price: 29.99,
    currency: "USD"
  });
};`}
        </pre>
        <div className="mt-3 flex flex-col items-center gap-1">
          <button
            onClick={handleLogEvent}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-gray-100 active:bg-gray-200"
          >
            Log Event
          </button>
          {eventLogged && (
            <span className="text-[10px] text-muted-foreground">
              Logged custom event with Braze
            </span>
          )}
        </div>
      </section>

      {/* Content Cards */}
      <section className="w-full rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-card-foreground">
          Content Cards
        </h3>

        {/* Default Content Card */}
        <p className="mb-2 text-xs text-muted-foreground">
          Basic content card subscription (default feed, multiple cards):
        </p>
        <pre className="mb-4 overflow-x-auto rounded-lg bg-secondary p-3 text-[11px] text-foreground">
{`import * as braze from "@braze/web-sdk";
import { useEffect, useRef } from "react";
import { getBraze, initBraze } from "@/lib/braze";

const defaultCardsContainerRef = useRef(null);

useEffect(() => {
  let subscription;
  let brazeInstance;
  (async () => {
    await initBraze();
    const braze = await getBraze();
    if (!braze) return;
    brazeInstance = braze;
    subscription = braze.subscribeToContentCardsUpdates(() => {});
    braze.requestContentCardsRefresh();
    braze.showContentCards(
      defaultCardsContainerRef.current,
      (cards) => (cards ?? []).filter((card) => card?.extras?.location !== "home")
    );
  })();
  return () => {
    if (!subscription) return;
    if (typeof subscription === "function") {
      subscription();
      return;
    }
    if (
      brazeInstance &&
      typeof brazeInstance.removeSubscription === "function"
    ) {
      brazeInstance.removeSubscription(subscription);
    }
    if (brazeInstance && typeof brazeInstance.hideContentCards === "function") {
      brazeInstance.hideContentCards(defaultCardsContainerRef.current);
    }
  };
}, []);`}
        </pre>

        <pre className="mb-4 overflow-x-auto rounded-lg bg-secondary p-3 text-[11px] text-foreground">
{`/* Optional: hide Braze feed controls + match template styling */
#default-content-cards-feed .ab-feed-buttons-wrapper {
  display: none !important;
}
#default-content-cards-feed .ab-feed {
  background: transparent !important;
  border: none !important;
  width: 100% !important;
  max-width: none !important;
}
#default-content-cards-feed .ab-feed-body {
  background: hsl(var(--card)) !important;
}`}
        </pre>

        {/* Example Default Content Card UI */}
        <p className="mb-2 text-xs text-muted-foreground">
          Default content card UI feed (location != home, supports multiple cards and all default Braze card styles):
        </p>
        <div className="mb-6 flex flex-col gap-2">
          <div
            id="default-content-cards-feed"
            ref={defaultCardsContainerRef}
            className={nonHomeCards.length > 0 ? "" : "hidden"}
          />
          {nonHomeCards.length === 0 && (
            <div className="rounded-lg border border-border bg-secondary p-3">
              <div className="flex gap-3">
                <img
                  src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=64&h=64&fit=crop"
                  alt="Card thumbnail"
                  className="h-16 w-16 shrink-0 rounded-md object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    Card Title
                  </span>
                  <span className="text-xs text-muted-foreground">
                    This is the card description text that provides more details.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Custom Styled Content Card with KVP */}
        <p className="mb-2 text-xs text-muted-foreground">
          Content card with custom styling using KVP filter (location: home, newest/top card only):
        </p>
        <pre className="mb-4 overflow-x-auto rounded-lg bg-secondary p-3 text-[11px] text-foreground">
{`import * as braze from "@braze/web-sdk";
import { useEffect, useState } from "react";

const [homeCard, setHomeCard] = useState(null);

useEffect(() => {
  const subscription = braze.subscribeToContentCardsUpdates((response) => {
    // Find the specific card using Key-Value Pair
    const homeCards = (response?.cards ?? []).filter(
      (card) => card.extras["location"] === "home"
    );

    // Use only the newest/top matching card for a single custom hero
    setHomeCard(homeCards[0] ?? null);
  });

  // Session identity is managed by bridge-entry/setUser in this template.
  braze.requestContentCardsRefresh();

  return () => {
    if (typeof subscription === "function") {
      subscription();
      return;
    }
    if (typeof braze.removeSubscription === "function") {
      braze.removeSubscription(subscription);
    }
  };
}, []);`}
        </pre>

        {/* Example Custom Styled Content Card UI */}
        <p className="mb-2 text-xs text-muted-foreground">
          Live custom styled card (KVP: location = home, newest/top only):
        </p>
        <div className="flex flex-col gap-2">
          {!homeCard && (
            <div className="rounded-lg border border-border bg-gradient-to-r from-secondary to-muted p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-foreground">
                    Welcome Home
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Discover personalized content just for you based on your preferences.
                  </span>
                </div>
                <img
                  src="https://images.unsplash.com/photo-1557683316-973673baf926?w=128&h=80&fit=crop"
                  alt="Content card visual"
                  className="h-20 w-32 shrink-0 rounded-lg object-cover"
                />
              </div>
            </div>
          )}
          {homeCard && (
            <div
              key={homeCard.id}
              className="rounded-lg border border-border bg-gradient-to-r from-secondary to-muted p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-foreground">
                    {homeCard.title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {homeCard.description || "No description"}
                  </span>
                </div>
                <img
                  src={
                    homeCard.imageUrl ??
                    "https://images.unsplash.com/photo-1557683316-973673baf926?w=128&h=80&fit=crop"
                  }
                  alt={homeCard.title}
                  className="h-20 w-32 shrink-0 rounded-lg object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <style jsx global>{`
        #default-content-cards-feed .ab-feed-buttons-wrapper {
          display: none !important;
        }
        #default-content-cards-feed .ab-feed {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          width: 100% !important;
          max-width: none !important;
          left: 0 !important;
          right: 0 !important;
          position: relative !important;
          top: 0 !important;
        }
        #default-content-cards-feed .ab-feed-body {
          background: hsl(var(--card)) !important;
        }
        #default-content-cards-feed .ab-card {
          background: hsl(var(--card)) !important;
          border-color: hsl(var(--border)) !important;
        }
      `}</style>

      {/* Banners */}
      <section className="w-full rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-card-foreground">
          Banners
        </h3>

        <p className="mb-2 text-xs text-muted-foreground">
          Subscribe to banners and insert into container:
        </p>
        <pre className="mb-4 overflow-x-auto rounded-lg bg-secondary p-3 text-[11px] text-foreground">
{`import * as braze from "@braze/web-sdk";
import { useEffect, useRef } from "react";

const bannerContainerRef = useRef(null);

useEffect(() => {
  const subscription = braze.subscribeToBannersUpdates(
    (bannersByPlacement) => {
      const bannerContainer = bannerContainerRef.current;
      const myBanner = bannersByPlacement?.["banner_1"] ?? null;

      if (bannerContainer && !myBanner) {
        bannerContainer.innerHTML = "";
        return;
      }

      if (bannerContainer && myBanner) {
        // Clear container to prevent duplicates
        bannerContainer.innerHTML = "";
        braze.insertBanner(myBanner, bannerContainer);
      }
    }
  );

  braze.requestBannersRefresh(["banner_1"]);

  return () => {
    if (typeof subscription === "function") {
      subscription();
      return;
    }
    if (typeof braze.removeSubscription === "function") {
      braze.removeSubscription(subscription);
    }
  };
}, []);`}
        </pre>

        {/* Live Banner UI */}
        <p className="mb-2 text-xs text-muted-foreground">
          Live banner (banner_1):
        </p>
        <div
          id="braze-banner-hero"
          ref={bannerContainerRef}
          className={hasBanner ? "" : "hidden"}
        />
        {!hasBanner && (
          <div className="rounded-lg border border-border bg-gradient-to-r from-blue-600 to-blue-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-white">
                  Special Offer
                </span>
                <span className="text-xs text-blue-100">
                  Limited time promotion - Act now!
                </span>
              </div>
              <div className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-blue-700">
                Learn More
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
