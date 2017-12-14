# -*- coding: utf-8 -*-
# Generated by Django 1.10.7 on 2017-11-02 20:08
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('riskofbias', '0016_riskofbiasmetricanswers'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='riskofbiasmetricanswers',
            options={'ordering': ('metric', 'answer_order'), 'verbose_name_plural': 'Study Evaluation metric answers'},
        ),
        migrations.RenameField(
            model_name='riskofbiasmetricanswers',
            old_name='choice_one',
            new_name='answer_choice',
        ),
        migrations.RenameField(
            model_name='riskofbiasmetricanswers',
            old_name='score_one',
            new_name='answer_score',
        ),
        migrations.RenameField(
            model_name='riskofbiasmetricanswers',
            old_name='shade_one',
            new_name='answer_shade',
        ),
        migrations.RenameField(
            model_name='riskofbiasmetricanswers',
            old_name='symbol_one',
            new_name='answer_symbol',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='choice_five',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='choice_four',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='choice_six',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='choice_three',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='choice_two',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='score_five',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='score_four',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='score_six',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='score_three',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='score_two',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='shade_five',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='shade_four',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='shade_six',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='shade_three',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='shade_two',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='symbol_five',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='symbol_four',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='symbol_six',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='symbol_three',
        ),
        migrations.RemoveField(
            model_name='riskofbiasmetricanswers',
            name='symbol_two',
        ),
        migrations.AddField(
            model_name='riskofbiasmetricanswers',
            name='answer_order',
            field=models.IntegerField(default=1),
        ),
        migrations.AddField(
            model_name='riskofbiasmetricanswers',
            name='metric',
            field=models.ForeignKey(default=5641, on_delete=django.db.models.deletion.CASCADE, related_name='answers', to='riskofbias.RiskOfBiasMetric'),
            preserve_default=False,
        ),
    ]
