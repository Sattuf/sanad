using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sanad.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProfilePrivacyPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HideIdentityUntilBookingConfirmed",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "QuietHoursEndHourUtc",
                table: "AspNetUsers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QuietHoursStartHourUtc",
                table: "AspNetUsers",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HideIdentityUntilBookingConfirmed",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "QuietHoursEndHourUtc",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "QuietHoursStartHourUtc",
                table: "AspNetUsers");
        }
    }
}
