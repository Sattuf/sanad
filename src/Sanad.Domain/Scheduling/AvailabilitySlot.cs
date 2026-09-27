using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Scheduling;

public enum SlotStatus { Open, Held, Booked, Cancelled }

/// <summary>
/// فترة إتاحة. ConcurrencyStamp يتغيّر مع كل تغيير حالة — يمنع حجزين متزامنين لنفس الفترة
/// عبر القفل التفاؤلي في قاعدة البيانات.
/// </summary>
public sealed class AvailabilitySlot : BaseEntity
{
    public static readonly TimeSpan MaxDuration = TimeSpan.FromHours(8);

    private AvailabilitySlot() { }

    public Guid ProviderProfileId { get; private set; }
    public DateTimeOffset StartUtc { get; private set; }
    public DateTimeOffset EndUtc { get; private set; }
    public SlotStatus Status { get; private set; } = SlotStatus.Open;
    public Guid ConcurrencyStamp { get; private set; } = Guid.NewGuid();

    public static AvailabilitySlot Create(Guid providerProfileId, DateTimeOffset startUtc, DateTimeOffset endUtc, DateTimeOffset nowUtc)
    {
        if (endUtc <= startUtc) throw new DomainException("نهاية الفترة يجب أن تكون بعد بدايتها.");
        if (startUtc <= nowUtc) throw new DomainException("لا يمكن إنشاء فترة إتاحة في الماضي.");
        if (endUtc - startUtc > MaxDuration) throw new DomainException("مدة الفترة الواحدة لا تتجاوز 8 ساعات.");
        if (startUtc > nowUtc.AddDays(180)) throw new DomainException("لا تُنشأ فترات إتاحة لأبعد من 180 يوماً.");
        return new AvailabilitySlot
        {
            ProviderProfileId = Guard.NotEmpty(providerProfileId, "المختص"),
            StartUtc = startUtc.ToUniversalTime(),
            EndUtc = endUtc.ToUniversalTime(),
        };
    }

    public bool Overlaps(DateTimeOffset startUtc, DateTimeOffset endUtc) => StartUtc < endUtc && startUtc < EndUtc;

    public void Hold(DateTimeOffset nowUtc)
    {
        if (Status != SlotStatus.Open) throw new DomainConflictException("هذه الفترة لم تعد متاحة.");
        if (StartUtc <= nowUtc) throw new DomainConflictException("هذه الفترة بدأت أو انتهت بالفعل.");
        Change(SlotStatus.Held);
    }

    public void Book()
    {
        if (Status is not (SlotStatus.Held or SlotStatus.Booked)) throw new DomainConflictException("لا يمكن تأكيد فترة غير محجوزة مبدئياً.");
        Change(SlotStatus.Booked);
    }

    public void Release()
    {
        if (Status is SlotStatus.Held or SlotStatus.Booked) Change(SlotStatus.Open);
    }

    public void Cancel()
    {
        if (Status != SlotStatus.Open) throw new DomainException("لا يمكن إلغاء فترة مرتبطة بحجز قائم — ألغِ الحجز أولاً.");
        Change(SlotStatus.Cancelled);
    }

    private void Change(SlotStatus status)
    {
        Status = status;
        ConcurrencyStamp = Guid.NewGuid();
    }
}
