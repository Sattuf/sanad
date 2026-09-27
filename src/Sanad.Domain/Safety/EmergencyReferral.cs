using Sanad.Domain.Common;

namespace Sanad.Domain.Safety;

/// <summary>مصدر إشارة الخطر — رمز فقط، بلا أي جزء من النص نفسه.</summary>
public enum EmergencySignalSource { BookingBeneficiaryNote, ConversationMessage, Report }

/// <summary>
/// مؤشر خطر عاجل رُصد في نص حر. يطلق مسار الإحالة والطوارئ فوراً، بصرف النظر عن نجاح العملية الأصلية.
/// لا يحمل النص الخام أبداً.
/// </summary>
public sealed record EmergencyReferralTriggeredEvent(Guid UserId, EmergencySignalSource Source, Guid SourceEntityId) : IDomainEvent;
