using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sanad.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReminderDevices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReminderDevices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Endpoint = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    P256dh = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Auth = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    MorningAt = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    EveningAt = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    SleepAt = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    LastMorningOn = table.Column<DateOnly>(type: "date", nullable: true),
                    LastEveningOn = table.Column<DateOnly>(type: "date", nullable: true),
                    LastSleepOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReminderDevices", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReminderDevices_Endpoint",
                table: "ReminderDevices",
                column: "Endpoint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReminderDevices_UserId",
                table: "ReminderDevices",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReminderDevices");
        }
    }
}
