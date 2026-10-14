using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sanad.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRuqyahWirdAndWrittenDuas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DailyWirdProgress",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CollectionId = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Counts = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    CompletedItems = table.Column<int>(type: "integer", nullable: false),
                    TotalItems = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyWirdProgress", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WrittenDuas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CollectionId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Text = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: false),
                    Source = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Repeat = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewerUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PublishedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WrittenDuas", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DailyWirdProgress_UserId_CollectionId_Day",
                table: "DailyWirdProgress",
                columns: new[] { "UserId", "CollectionId", "Day" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DailyWirdProgress_UserId_Day",
                table: "DailyWirdProgress",
                columns: new[] { "UserId", "Day" });

            migrationBuilder.CreateIndex(
                name: "IX_WrittenDuas_Status_CollectionId_SortOrder",
                table: "WrittenDuas",
                columns: new[] { "Status", "CollectionId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailyWirdProgress");

            migrationBuilder.DropTable(
                name: "WrittenDuas");
        }
    }
}
