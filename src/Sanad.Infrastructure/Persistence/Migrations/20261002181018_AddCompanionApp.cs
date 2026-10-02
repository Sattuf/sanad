using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Sanad.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanionApp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Client",
                table: "ReminderDevices",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Web");

            migrationBuilder.CreateTable(
                name: "CompanionEventCounters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Dimension = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Count = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanionEventCounters", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmergencyContacts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CountryCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    Label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SourceRef = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    EditedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    VerifiedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    VerifiedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmergencyContacts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Khatmas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Mode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    IntentionEncrypted = table.Column<string>(type: "text", nullable: true),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Round = table.Column<int>(type: "integer", nullable: false),
                    CompletedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    InviteCodeHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    InviteCodeEncrypted = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Khatmas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlanAuthors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Bio = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ConsentRef = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ConsentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ConsentRecordedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanAuthors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlanEnrollments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanKey = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    PlanVersion = table.Column<int>(type: "integer", nullable: false),
                    DurationDays = table.Column<int>(type: "integer", nullable: false),
                    StartedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedDays = table.Column<List<int>>(type: "integer[]", nullable: false),
                    LastCompletedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Reminder = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    EndedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanEnrollments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RuqyahPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    PreviousVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Summary = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Contents = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DurationDays = table.Column<int>(type: "integer", nullable: false),
                    MinutesPerDay = table.Column<int>(type: "integer", nullable: false),
                    Days = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewerUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SafetyCheckedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PublishedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    WithdrawReason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RuqyahPlans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "KhatmaJuz",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Index = table.Column<int>(type: "integer", nullable: false),
                    AssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoneAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    KhatmaId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KhatmaJuz", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KhatmaJuz_Khatmas_KhatmaId",
                        column: x => x.KhatmaId,
                        principalTable: "Khatmas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "KhatmaMembers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    JoinedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    KhatmaId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KhatmaMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KhatmaMembers_Khatmas_KhatmaId",
                        column: x => x.KhatmaId,
                        principalTable: "Khatmas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CompanionEventCounters_Day_Name_Dimension",
                table: "CompanionEventCounters",
                columns: new[] { "Day", "Name", "Dimension" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmergencyContacts_Status_CountryCode",
                table: "EmergencyContacts",
                columns: new[] { "Status", "CountryCode" });

            migrationBuilder.CreateIndex(
                name: "IX_KhatmaJuz_KhatmaId_Index",
                table: "KhatmaJuz",
                columns: new[] { "KhatmaId", "Index" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KhatmaMembers_KhatmaId",
                table: "KhatmaMembers",
                column: "KhatmaId");

            migrationBuilder.CreateIndex(
                name: "IX_KhatmaMembers_UserId",
                table: "KhatmaMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Khatmas_InviteCodeHash",
                table: "Khatmas",
                column: "InviteCodeHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Khatmas_OwnerUserId",
                table: "Khatmas",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanEnrollments_PlanId",
                table: "PlanEnrollments",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_PlanEnrollments_UserId_IsActive",
                table: "PlanEnrollments",
                columns: new[] { "UserId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_RuqyahPlans_AuthorId",
                table: "RuqyahPlans",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_RuqyahPlans_Key_Version",
                table: "RuqyahPlans",
                columns: new[] { "Key", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RuqyahPlans_Status",
                table: "RuqyahPlans",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CompanionEventCounters");

            migrationBuilder.DropTable(
                name: "EmergencyContacts");

            migrationBuilder.DropTable(
                name: "KhatmaJuz");

            migrationBuilder.DropTable(
                name: "KhatmaMembers");

            migrationBuilder.DropTable(
                name: "PlanAuthors");

            migrationBuilder.DropTable(
                name: "PlanEnrollments");

            migrationBuilder.DropTable(
                name: "RuqyahPlans");

            migrationBuilder.DropTable(
                name: "Khatmas");

            migrationBuilder.DropColumn(
                name: "Client",
                table: "ReminderDevices");
        }
    }
}
