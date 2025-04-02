import { Home, BarChart, ClipboardList, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

export function BottomNavigation() {
  const router = useRouter();
  const currentPath = router.pathname;
  const { isGuest } = useAuthStore();
  const showNotification = useUIStore(state => state.showNotification);

  const handleStatistikClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const statistikUrl = 'https://jassstatistik.shinyapps.io/mobile/';
    
    showNotification({
      message: 'Funktion in Entwicklung. Die verlinkte Jass-Statistikseite dient lediglich zur Illustration.',
      type: 'info',
      actions: [
        {
          label: 'Verstanden',
          onClick: () => {
            window.open(statistikUrl, '_blank', 'noopener,noreferrer');
          },
          className: 'bg-yellow-600 hover:bg-yellow-700'
        },
      ],
      preventClose: true
    });
  };

  const navigationItems = [
    {
      name: 'Home',
      href: '/start',
      icon: Home,
      active: currentPath === '/start'
    },
    {
      name: 'Profil',
      href: '/profile',
      icon: User,
      active: currentPath.startsWith('/profile')
    },
    {
      name: 'Statistik',
      href: 'https://jassstatistik.shinyapps.io/mobile/',
      icon: BarChart,
      active: false,
      external: true,
      onClick: handleStatistikClick
    },
    {
      name: 'Jassen',
      href: '/jass',
      icon: ClipboardList,  
      active: currentPath === '/jass'
    }
  ];

  const hideNavigation = isGuest || currentPath.startsWith('/jass');

  if (hideNavigation) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border-t border-gray-800 h-24 max-w-3xl w-full">
      <div className="w-full flex justify-around items-center h-full px-4 pb-safe pb-8">
        {navigationItems.map((item) => (
          item.external && item.onClick ? (
            <button
              key={item.name}
              onClick={item.onClick}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full space-y-1',
                'text-sm font-medium transition-colors',
                'text-gray-400 hover:text-gray-300',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 rounded-md'
              )}
            >
              <item.icon size={24} />
              <span className="text-xs">{item.name}</span>
            </button>
          ) : item.external ? (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex flex-col items-center justify-center w-full h-full space-y-1',
                'text-sm font-medium transition-colors',
                'text-gray-400 hover:text-gray-300'
              )}
            >
              <item.icon size={24} />
              <span className="text-xs">{item.name}</span>
            </a>
          ) : (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full space-y-1',
                'text-sm font-medium transition-colors',
                item.active
                  ? 'text-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              )}
            >
              <item.icon size={24} />
              <span className="text-xs">{item.name}</span>
            </Link>
          )
        ))}
      </div>
    </nav>
  );
} 