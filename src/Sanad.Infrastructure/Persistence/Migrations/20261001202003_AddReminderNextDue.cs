using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sanad.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReminderNextDue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "NextDueAtUtc",
                table: "ReminderDevices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReminderDevices_NextDueAtUtc",
                table: "ReminderDevices",
                column: "NextDueAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ReminderDevices_NextDueAtUtc",
                table: "ReminderDevices");

            migrationBuilder.DropColumn(
                name: "NextDueAtUtc",
                table: "ReminderDevices");
        }
    }
}
