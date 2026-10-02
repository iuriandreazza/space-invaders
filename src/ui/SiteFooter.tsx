/**
 * The favicons of the three sites, copied: the content security policy keeps the page from loading images of others.
 * The Noûs one is its icon for dark pages, since this footer is dark.
 */
export const CREDITS: ReadonlyArray<{ name: string; href: string; icon: string }> = [
  { name: 'Iuri Andreazza', href: 'https://iuriandreazza.com.br', icon: '/credits/iuri-andreazza.png' },
  { name: 'Noûs', href: 'https://nous.biz', icon: '/credits/nous.png' },
  { name: 'ZeroServer', href: 'https://zeroserver.cc', icon: '/credits/zeroserver.svg' },
];

interface SiteFooterProps {
  onOpenCookieSettings: () => void;
}

export function SiteFooter({ onOpenCookieSettings }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <ul className="credits">
        {CREDITS.map(({ name, href, icon }) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener">
              <img src={icon} alt="" width={20} height={20} />
              {name}
            </a>
          </li>
        ))}
        <li>
          <button type="button" className="link-button" onClick={onOpenCookieSettings}>
            Cookie settings
          </button>
        </li>
      </ul>
      <p className="site-footer__disclaimer">
        A fan-made tribute to the arcade classics Space Invaders (Taito, 1978) and Space Invaders Frenzy (Raw Thrills,
        2017). Not affiliated with or endorsed by Taito.
      </p>
    </footer>
  );
}
