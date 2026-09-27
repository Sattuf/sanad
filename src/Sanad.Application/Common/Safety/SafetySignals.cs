using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Common;
using Sanad.Domain.Safety;

namespace Sanad.Application.Common.Safety;

public static class SafetySignals
{
    /// <summary>
    /// يُقيِّم النص فوراً ويرفع علم الإحالة للطلب الحالي — قبل أي منطق عمل قد يفشل،
    /// حتى تصل معلومات الطوارئ للمستخدم بصرف النظر عن نجاح العملية الأصلية.
    /// </summary>
    public static void EvaluateEarly(ISafeReferralEvaluator evaluator, ISafetySignalContext context, string? text)
    {
        if (!string.IsNullOrWhiteSpace(text) && evaluator.RequiresImmediateEmergencyReferral(new SafetySignal(text)))
            context.Flag();
    }

    public static void CollectFrom(ISafetySignalContext context, params BaseEntity[] entities)
    {
        if (entities.Any(e => e.DomainEvents.OfType<EmergencyReferralTriggeredEvent>().Any())) context.Flag();
    }
}
