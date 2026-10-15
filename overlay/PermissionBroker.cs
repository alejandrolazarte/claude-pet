namespace PetOverlay;

// Questions waiting for an answer from the chat or from the pet's bubble. The first answer takes the question, so a
// second one (the other surface, or a click after the timeout) finds nothing to answer.
public sealed class PermissionBroker
{
    public static readonly TimeSpan Timeout = TimeSpan.FromMinutes(2);

    private readonly Dictionary<string, (PermissionRequest Request, DateTime AskedAt)> _pending = [];

    public void Ask(PermissionRequest request, DateTime now) => _pending[request.RequestId] = (request, now);

    public PermissionRequest? Take(string requestId) => _pending.Remove(requestId, out var entry) ? entry.Request : null;

    public IReadOnlyList<PermissionRequest> TakeExpired(DateTime now)
    {
        var expired = _pending.Values.Where(entry => now - entry.AskedAt >= Timeout).Select(entry => entry.Request).ToList();
        expired.ForEach(request => _pending.Remove(request.RequestId));

        return expired;
    }

    public IReadOnlyList<PermissionRequest> TakeAll()
    {
        var all = _pending.Values.Select(entry => entry.Request).ToList();
        _pending.Clear();

        return all;
    }
}
