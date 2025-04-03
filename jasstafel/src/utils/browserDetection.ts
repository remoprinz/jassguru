// Interface für iOS Navigator mit standalone-Eigenschaft
interface IosNavigator extends Navigator {
  standalone?: boolean;
}

export const isPWA = (): boolean => {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as IosNavigator).standalone ||
    document.referrer.includes("android-app://")
  );
};
