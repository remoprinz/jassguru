/**
 * PublicViewTopBar
 * 
 * Top-Bar Komponente für Public View auf Mobile - analog zu BottomNavigation
 * Füllt den Safe Area Inset oben, damit sich Content darunter schieben kann
 */

export function PublicViewTopBar() {
  return (
    <div 
      className="fixed top-0 left-0 right-0 z-50 bg-gray-900"
      style={{
        height: 'env(safe-area-inset-top, 0px)',
        paddingTop: 'env(safe-area-inset-top, 0px)'
      }}
    />
  );
}

