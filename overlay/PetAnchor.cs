using System.Windows;

namespace PetOverlay;

// The window takes the size of its content from its top-left corner: anything drawn above or beside the character
// (the steps bubble) would push it. The page says where the character sits in the window, and the window moves by
// what it shifted, so the character stays put on the screen.
public static class PetAnchor
{
    public static Point WindowPositionFor(Point window, Point? previousAnchor, Point anchor) =>
        previousAnchor is { } previous ? new Point(window.X + previous.X - anchor.X, window.Y + previous.Y - anchor.Y) : window;
}
