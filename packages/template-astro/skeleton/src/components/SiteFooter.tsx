import { Icon } from "@mintlify/components";

interface SiteFooterProps {
  socials?: Record<string, string>;
}

const socialIconMap: Record<string, string> = {
  x: "x-twitter",
  twitter: "x-twitter",
  github: "github",
  linkedin: "linkedin",
  youtube: "youtube",
  discord: "discord"
};

export default function SiteFooter({ socials = {} }: SiteFooterProps) {
  const entries = Object.entries(socials);
  if (entries.length === 0) {
    return null;
  }

  return (
    <footer className="border-t border-gray-200 mt-24">
      <div className="flex gap-8 justify-between items-center py-10 flex-wrap">
        <div className="flex gap-5 flex-wrap">
          {entries.map(([type, url]) => {
            const iconName = socialIconMap[type.toLowerCase()] || type;
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={type}
              >
                <Icon icon={iconName} size={20} color="currentColor" />
              </a>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
