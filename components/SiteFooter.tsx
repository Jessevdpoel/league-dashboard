/**
 * Required Riot Games legal disclaimer, shown site-wide. Riot's developer policy
 * requires third-party sites to state they are not endorsed by Riot Games.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card px-7 py-6 text-xs leading-relaxed text-foreground/80/70">
      <p className="mx-auto max-w-4xl">
        LeagueDash isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions
        of Riot Games or anyone officially involved in producing or managing Riot Games properties.
        Riot Games and all associated properties are trademarks or registered trademarks of Riot
        Games, Inc.
      </p>
    </footer>
  );
}
