using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;

namespace PetOverlay;

public static class WindowPlacement
{
    private const double _margin = 24;

    public static (Point Position, Point? Anchor) For(Rect workArea, Rect screen, Size window, string? saved)
    {
        var corner = (new Point(workArea.Right - window.Width - _margin, workArea.Bottom - window.Height - _margin), (Point?)null);
        if (saved is null)
        {
            return corner;
        }

        try
        {
            var node = JsonNode.Parse(saved);
            var left = node?["left"]?.GetValue<double>();
            var top = node?["top"]?.GetValue<double>();
            if (left is not double x || top is not double y || !screen.Contains(new Point(x + 20, y + 20)))
            {
                return corner;
            }

            // Saved with the bubble open or closed: the first size from the page moves the window to match.
            if (node?["anchorX"]?.GetValue<double>() is double anchorX && node["anchorY"]?.GetValue<double>() is double anchorY)
            {
                return (new Point(x, y), new Point(anchorX, anchorY));
            }

            return (new Point(x, y), null);
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException)
        {
            // A broken position file falls back to the bottom-right corner.
            return corner;
        }
    }

    // A window taller or wider than the work area keeps its top-left in view.
    public static Point Inside(Rect workArea, Point window, Size size) => new(
        Math.Max(workArea.Left, Math.Min(window.X, workArea.Right - size.Width)),
        Math.Max(workArea.Top, Math.Min(window.Y, workArea.Bottom - size.Height)));
}
